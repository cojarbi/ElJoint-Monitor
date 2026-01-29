"""
Spot Matcher Tool for Media Monitor Agent
Matches planned spots with aired spots using fuzzy matching
"""
import json
from typing import Optional
from Levenshtein import ratio as levenshtein_ratio

from .types import (
    PlannedSpot, AiredSpot, MatchedSpot, Discrepancy,
    MatchResult, DiscrepancyType, Severity
)


def fuzzy_match_program(program1: str, program2: str) -> float:
    """
    Calculate similarity score between two program names.
    
    Args:
        program1: First program name
        program2: Second program name
        
    Returns:
        Similarity score from 0 to 1
    """
    if not program1 or not program2:
        return 0.0
    
    # Normalize: lowercase, remove extra spaces
    p1 = " ".join(program1.lower().split())
    p2 = " ".join(program2.lower().split())
    
    # Exact match
    if p1 == p2:
        return 1.0
    
    # Levenshtein ratio
    return levenshtein_ratio(p1, p2)


def check_duration_match(planned: int, actual: int, tolerance: int = 2) -> bool:
    """
    Check if actual duration is within tolerance of planned duration.
    
    Args:
        planned: Planned duration in seconds
        actual: Actual duration in seconds
        tolerance: Allowed difference in seconds
        
    Returns:
        True if within tolerance
    """
    return abs(planned - actual) <= tolerance


def check_channel_match(planned: str, aired: str) -> bool:
    """Check if channels match (case-insensitive)"""
    if not planned or not aired:
        return False
    return planned.lower().strip() == aired.lower().strip()


def categorize_discrepancy(
    planned: Optional[PlannedSpot],
    aired: Optional[AiredSpot],
    match_score: float = 0
) -> Discrepancy:
    """
    Categorize a discrepancy based on what didn't match.
    
    Args:
        planned: The planned spot (None if extra aired spot)
        aired: The aired spot (None if missing planned spot)
        match_score: The fuzzy match score
        
    Returns:
        Discrepancy object with categorization
    """
    if planned is None and aired is not None:
        return Discrepancy(
            type=DiscrepancyType.EXTRA_SPOT,
            severity=Severity.MEDIUM,
            channel=aired.channel,
            program=aired.program,
            expected=None,
            actual=f"{aired.program} on {aired.date}",
            explanation=f"Spot aired on {aired.channel} - '{aired.program}' was not in the plan"
        )
    
    if aired is None and planned is not None:
        return Discrepancy(
            type=DiscrepancyType.MISSING_SPOT,
            severity=Severity.HIGH,
            channel=planned.channel,
            program=planned.program,
            expected=f"{planned.program} ({planned.days})",
            actual=None,
            explanation=f"Planned spot on {planned.channel} - '{planned.program}' did not air"
        )
    
    if planned and aired:
        # Determine which aspect didn't match
        if not check_channel_match(planned.channel, aired.channel):
            return Discrepancy(
                type=DiscrepancyType.WRONG_CHANNEL,
                severity=Severity.HIGH,
                channel=planned.channel,
                program=planned.program,
                expected=planned.channel,
                actual=aired.channel,
                explanation=f"Spot for '{planned.program}' aired on {aired.channel} instead of {planned.channel}"
            )
        
        if not check_duration_match(planned.duration, aired.duration):
            return Discrepancy(
                type=DiscrepancyType.WRONG_DURATION,
                severity=Severity.MEDIUM,
                channel=planned.channel,
                program=planned.program,
                expected=f"{planned.duration}s",
                actual=f"{aired.duration}s",
                explanation=f"Spot '{planned.program}' had duration {aired.duration}s instead of planned {planned.duration}s"
            )
        
        if match_score < 0.8:
            return Discrepancy(
                type=DiscrepancyType.WRONG_PROGRAM,
                severity=Severity.HIGH,
                channel=planned.channel,
                program=planned.program,
                expected=planned.program,
                actual=aired.program,
                explanation=f"Spot aired in '{aired.program}' instead of planned '{planned.program}' (similarity: {match_score:.0%})"
            )
    
    # Default
    return Discrepancy(
        type=DiscrepancyType.MISSING_SPOT,
        severity=Severity.LOW,
        channel=planned.channel if planned else (aired.channel if aired else "Unknown"),
        program=planned.program if planned else (aired.program if aired else "Unknown"),
        expected=str(planned) if planned else None,
        actual=str(aired) if aired else None,
        explanation="Unspecified discrepancy"
    )


def match_spots(
    planned_spots: list[PlannedSpot],
    aired_spots: list[AiredSpot],
    program_threshold: float = 0.8,
    duration_tolerance: int = 2
) -> MatchResult:
    """
    Match aired spots with planned spots using fuzzy matching.
    
    Args:
        planned_spots: List of planned spots from the Plan file
        aired_spots: List of aired spots from the Execution file
        program_threshold: Minimum similarity score for program name match
        duration_tolerance: Maximum difference in duration (seconds)
        
    Returns:
        MatchResult containing matches and discrepancies
    """
    matched = []
    discrepancies = []
    unmatched_planned = list(planned_spots)  # Copy to track
    unmatched_aired = []
    
    # Track how many times each planned spot has been matched
    planned_match_counts = {id(p): 0 for p in planned_spots}
    
    for aired in aired_spots:
        best_match = None
        best_score = 0
        best_planned = None
        
        # Find best matching planned spot
        for planned in planned_spots:
            # Must match channel
            if not check_channel_match(planned.channel, aired.channel):
                continue
            
            # Must match duration within tolerance
            if not check_duration_match(planned.duration, aired.duration, duration_tolerance):
                continue
            
            # Calculate program name similarity
            score = fuzzy_match_program(planned.program, aired.program)
            
            if score > best_score:
                best_score = score
                best_planned = planned
        
        if best_planned and best_score >= program_threshold:
            # Good match found
            matched.append(MatchedSpot(
                planned=best_planned,
                aired=aired,
                match_score=best_score
            ))
            planned_match_counts[id(best_planned)] += 1
            
            # Remove from unmatched if this is first match
            if best_planned in unmatched_planned:
                unmatched_planned.remove(best_planned)
        else:
            # No match found
            unmatched_aired.append(aired)
            discrepancies.append(categorize_discrepancy(None, aired))
    
    # Add discrepancies for unmatched planned spots
    for planned in unmatched_planned:
        discrepancies.append(categorize_discrepancy(planned, None))
    
    return MatchResult(
        matched=matched,
        discrepancies=discrepancies,
        unmatched_planned=unmatched_planned,
        unmatched_aired=unmatched_aired
    )


def match_spots_tool(planned_json: str, aired_json: str) -> str:
    """
    Match planned spots with aired spots using intelligent fuzzy matching.
    
    Args:
        planned_json: JSON string of planned spots from parse_plan_file
        aired_json: JSON string of aired spots from parse_execution_file
        
    Returns:
        JSON string with match results including matches and discrepancies
    """
    try:
        planned_data = json.loads(planned_json)
        aired_data = json.loads(aired_json)
        
        if "error" in planned_data:
            return json.dumps({"error": f"Plan file error: {planned_data['error']}"})
        
        if "error" in aired_data:
            return json.dumps({"error": f"Execution file error: {aired_data['error']}"})
        
        # Convert JSON back to PlannedSpot objects
        planned_spots = []
        for sheet_spots in planned_data.get("data", {}).values():
            for spot_dict in sheet_spots:
                planned_spots.append(PlannedSpot(
                    channel=spot_dict["channel"],
                    program=spot_dict["program"],
                    days=spot_dict["days"],
                    time_slot=spot_dict["time_slot"],
                    duration=spot_dict["duration"],
                    count=spot_dict.get("count", 1)
                ))
        
        # Convert JSON back to AiredSpot objects
        aired_spots = []
        from datetime import datetime
        for spot_dict in aired_data.get("data", []):
            date = None
            if spot_dict.get("date"):
                try:
                    date = datetime.fromisoformat(spot_dict["date"])
                except ValueError:
                    pass
            
            aired_spots.append(AiredSpot(
                channel=spot_dict["channel"],
                program=spot_dict["program"],
                date=date,
                duration=spot_dict["duration"]
            ))
        
        # Perform matching
        result = match_spots(planned_spots, aired_spots)
        
        return json.dumps({
            "success": True,
            "summary": {
                "total_planned": len(planned_spots),
                "total_aired": len(aired_spots),
                "matched": len(result.matched),
                "unmatched_planned": len(result.unmatched_planned),
                "unmatched_aired": len(result.unmatched_aired),
                "discrepancies": len(result.discrepancies)
            },
            "data": result.to_dict()
        }, indent=2)
        
    except Exception as e:
        return json.dumps({"error": str(e)})
