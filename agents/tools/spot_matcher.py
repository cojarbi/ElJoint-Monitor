"""
Spot Matcher Tool for Media Monitor Agent
Matches planned spots with aired spots using "One-to-One" logic
"""
import json
from typing import Optional, Set
from Levenshtein import ratio as levenshtein_ratio
from datetime import datetime

from .types import (
    PlannedSpot, AiredSpot, MatchedSpot, Discrepancy,
    MatchResult, DiscrepancyType, Severity
)
from .excel_parser import parse_day_pattern  # Re-use the day parser helper

def fuzzy_match_program(program1: str, program2: str) -> float:
    """Calculate similarity score between two program names."""
    if not program1 or not program2: return 0.0
    p1 = " ".join(program1.lower().split())
    p2 = " ".join(program2.lower().split())
    if p1 == p2: return 1.0
    return levenshtein_ratio(p1, p2)

def check_duration_match(planned: int, actual: int, tolerance: int = 2) -> bool:
    """Check if actual duration is within tolerance."""
    return abs(planned - actual) <= tolerance

def check_channel_match(planned: str, aired: str) -> bool:
    """Strict channel match (normalization happens in parser)."""
    if not planned or not aired: return False
    return planned.lower().strip() == aired.lower().strip()

def check_day_match(planned_days_pattern: str, air_date: datetime) -> bool:
    """
    Check if the specific air date falls within the planned day pattern.
    Example: Does 2025-10-20 (Monday) match 'L-V'? -> Yes
    """
    if not air_date or not planned_days_pattern:
        return False
    
    # 0=Monday, 6=Sunday
    weekday = air_date.weekday()
    allowed_days = parse_day_pattern(planned_days_pattern)
    
    return weekday in allowed_days

def match_spots(
    planned_spots: list[PlannedSpot],
    aired_spots: list[AiredSpot],
    program_threshold: float = 0.8,
    duration_tolerance: int = 2
) -> MatchResult:
    """
    Match spots using One-to-One logic. 
    Prioritizes 'Perfect Matches' first, then 'Wrong Day Matches'.
    Everything else is Overage.
    """
    matched = []
    discrepancies = []
    
    # Track consumed planned spots by their unique object ID
    consumed_planned_ids: Set[int] = set()
    
    # We will process aired spots in two passes to prioritize quality matches
    # Pass 1: Find Perfect Matches (Program + Channel + Duration + CORRECT DAY)
    # Pass 2: Find Imperfect Matches (Wrong Day)
    
    unmatched_aired_indices = set(range(len(aired_spots)))
    
    # --- PASS 1: Perfect Matches ---
    for i, aired in enumerate(aired_spots):
        best_match = None
        best_score = 0
        
        for planned in planned_spots:
            # Skip if already used
            if id(planned) in consumed_planned_ids:
                continue
                
            # Hard constraints
            if not check_channel_match(planned.channel, aired.channel): continue
            if not check_duration_match(planned.duration, aired.duration, duration_tolerance): continue
            
            # Program Fuzzy Match
            score = fuzzy_match_program(planned.program, aired.program)
            
            if score >= program_threshold:
                # Check Day Constraint for "Perfect Match"
                if check_day_match(planned.days, aired.date):
                    if score > best_score:
                        best_score = score
                        best_match = planned

        if best_match:
            # We found a perfect match
            matched.append(MatchedSpot(
                planned=best_match,
                aired=aired,
                match_score=best_score
            ))
            consumed_planned_ids.add(id(best_match))
            unmatched_aired_indices.remove(i)

    # --- PASS 2: Wrong Day Matches (but still correct program) ---
    for i in list(unmatched_aired_indices): # Iterate copy to allow modification
        aired = aired_spots[i]
        best_match = None
        best_score = 0
        
        for planned in planned_spots:
            if id(planned) in consumed_planned_ids: continue
            if not check_channel_match(planned.channel, aired.channel): continue
            if not check_duration_match(planned.duration, aired.duration, duration_tolerance): continue
            
            score = fuzzy_match_program(planned.program, aired.program)
            
            # We accept the match even if the day is wrong, but flag it
            if score >= program_threshold:
                if score > best_score:
                    best_score = score
                    best_match = planned
        
        if best_match:
            # Record as matched (but flagged as wrong day)
            matched.append(MatchedSpot(
                planned=best_match,
                aired=aired,
                match_score=best_score
            ))

            # Found a match, but it's on the wrong day
            discrepancies.append(Discrepancy(
                type=DiscrepancyType.WRONG_TIME, # Using WRONG_TIME for Wrong Day
                severity=Severity.MEDIUM,
                channel=best_match.channel,
                program=best_match.program,
                expected=f"{best_match.days}",
                actual=f"{aired.date.strftime('%A')}",
                explanation=(
                    f"Spot aired on wrong day ({aired.date.strftime('%Y-%m-%d')}) "
                    f"for plan '{best_match.days}'"
                )
            ))
            # Mark as consumed so it doesn't look "Missing" later
            consumed_planned_ids.add(id(best_match))
            unmatched_aired_indices.remove(i)

    # --- FINALIZING: Overage and Missing ---
    
    # Any aired spot still unmatched is "Overage" (Extra Spot)
    for i in unmatched_aired_indices:
        aired = aired_spots[i]
        discrepancies.append(Discrepancy(
            type=DiscrepancyType.EXTRA_SPOT,
            severity=Severity.LOW,
            channel=aired.channel,
            program=aired.program,
            expected=None,
            actual=f"{aired.program}",
            explanation=f"Overage: Extra spot aired on {aired.date}"
        ))

    # Any planned spot not in consumed_ids is "Missing"
    unmatched_planned = []
    for planned in planned_spots:
        if id(planned) not in consumed_planned_ids:
            unmatched_planned.append(planned)
            discrepancies.append(Discrepancy(
                type=DiscrepancyType.MISSING_SPOT,
                severity=Severity.HIGH,
                channel=planned.channel,
                program=planned.program,
                expected=f"{planned.program}",
                actual=None,
                explanation=f"Spot did not air"
            ))

    return MatchResult(
        matched=matched,
        discrepancies=discrepancies,
        unmatched_planned=unmatched_planned,
        # Convert set of indices back to list of objects for the result
        unmatched_aired=[aired_spots[i] for i in unmatched_aired_indices]
    )

def match_spots_tool(planned_json: str, aired_json: str) -> str:
    """
    Match planned spots against aired spots to find discrepancies.
    
    Args:
        planned_json: JSON string containing list of planned spots (from parse_plan_file_tool)
        aired_json: JSON string containing list of aired spots (from parse_execution_file_tool)
        
    Returns:
        JSON string with match results and discrepancies
    """
    try:
        planned_data = json.loads(planned_json)
        aired_data = json.loads(aired_json)
        
        # Extract lists if wrapped in "data" key
        if isinstance(planned_data, dict) and "data" in planned_data:
            planned_raw = []
            for channel_spots in planned_data["data"].values():
                planned_raw.extend(channel_spots)
        else:
            planned_raw = planned_data
            
        if isinstance(aired_data, dict) and "data" in aired_data:
            aired_raw = aired_data["data"]
        else:
            aired_raw = aired_data
            
        # Convert to objects
        planned_spots = []
        for p in planned_raw:
            # Handle multiple count by duplicating spots for matching logic
            count = p.get("count", 1)
            for _ in range(count):
                planned_spots.append(PlannedSpot(
                    channel=p["channel"],
                    program=p["program"],
                    days=p["days"],
                    time_slot=p["time_slot"],
                    duration=p["duration"],
                    count=1 # Individual instance
                ))
                
        aired_spots = []
        for a in aired_raw:
            date_val = None
            if a.get("date"):
                try:
                    date_val = datetime.fromisoformat(a["date"])
                except ValueError:
                    pass
            
            aired_spots.append(AiredSpot(
                channel=a["channel"],
                program=a["program"],
                date=date_val,
                duration=a["duration"]
            ))
            
        # Run matching
        result = match_spots(planned_spots, aired_spots)
        result_dict = result.to_dict()

        # Add summary in the shape expected by metrics/report tools
        summary = {
            "total_planned": len(planned_spots),
            "total_aired": len(aired_spots),
            "matched": len(result_dict.get("matched", [])),
            "unmatched_planned": len(result_dict.get("unmatched_planned", [])),
            "unmatched_aired": len(result_dict.get("unmatched_aired", [])),
        }
        
        return json.dumps({
            "success": True,
            "summary": summary,
            "data": result_dict
        }, indent=2)
        
    except Exception as e:
        return json.dumps({"error": str(e)})
