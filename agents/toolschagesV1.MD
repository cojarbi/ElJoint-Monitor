Here are the updated tools incorporating your specific business rules.

Key Changes Applied:

Logic: One-to-One with Overage

Old Behavior: One planned spot could "validate" multiple aired spots.

New Behavior: Implemented a consumed_planned_ids set. Once a planned spot is matched (even if matched as "Wrong Day"), it is removed from the pool. Any subsequent airings of that same ad are strictly flagged as Overage (Extra Spots).

Logic: Strict Day Matching

Old Behavior: Ignored the specific day of the week (e.g., allowed a Mon-Fri ad to run on Sunday).

New Behavior: Checks the actual air date against the planned L-V (Mon-Fri) pattern. If it matches the program but falls on the wrong day, it is now flagged as a Wrong Day Discrepancy.

Tool: AI Normalization

Old Behavior: Used a hardcoded dictionary for channel names.

New Behavior: Added smart_normalize_batch to excel_parser.py. It collects all unique channel names from the file and makes one single AI call to map them to your standard names ("TVN", "Telemetro"), ensuring robustness against new typos without slowing down processing.

1. Updated spot_matcher.py

Replaces the previous version to handle the "Consumed" and "Wrong Day" logic.

Python
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
            # Found a match, but it's on the wrong day
            discrepancies.append(Discrepancy(
                type=DiscrepancyType.WRONG_TIME, # Using WRONG_TIME for Wrong Day
                severity=Severity.MEDIUM,
                channel=planned.channel,
                program=planned.program,
                expected=f"{planned.days}",
                actual=f"{aired.date.strftime('%A')}",
                explanation=f"Spot aired on wrong day ({aired.date.strftime('%Y-%m-%d')}) for plan '{planned.days}'"
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
    """Wrapped tool function remains similar, just calls the updated logic above"""
    # ... (Same wrapper logic as before, just ensuring data types are correct) ...
    # [Code truncated for brevity as the wrapper logic is identical to previous]
    return json.dumps({"success": True, "data": "..."}) # Placeholder
2. Updated excel_parser.py

Adds the smart_normalize_batch function using Gemini to clean channel names before processing.

Python
"""
Excel Parser with AI Normalization
"""
import pandas as pd
from datetime import datetime
import json
import os
from google import genai
from google.genai import types

# ... (Previous imports and simple helpers) ...

def smart_normalize_batch(raw_channels: list[str]) -> dict:
    """
    Use Gemini to create a normalization map for a list of raw channel names.
    This runs ONCE per file, not per row, for efficiency.
    """
    if not raw_channels:
        return {}
        
    unique_channels = list(set([str(c).strip() for c in raw_channels if c]))
    
    prompt = f"""
    You are a data cleaning assistant for a Media Agency.
    Map these raw channel names to the standard names: "TVN" or "Telemetro".
    
    Raw Names: {json.dumps(unique_channels)}
    
    Rules:
    - "TVN", "TVN-2", "Television Nacional", "TVN HD" -> "TVN"
    - "Telemetro", "MEDCOM", "Telemetro Reporta", "Canal 13" -> "Telemetro"
    - If unsure or unrelated, keep the original name.
    
    Return JSON: {{"Raw Name": "Standard Name"}}
    """
    
    try:
        client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))
        response = client.models.generate_content(
            model='gemini-3-flash-preview',
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"AI Normalization failed: {e}. Falling back to raw names.")
        # Fallback: Map names to themselves
        return {name: name for name in unique_channels}

def parse_execution_file(file_path: str) -> list[AiredSpot]:
    try:
        # ... (File opening logic same as before) ...
        df_raw = pd.read_excel(excel_file, sheet_name=target_sheet, header=None)
        # ... (Header finding logic same as before) ...
        
        # --- NEW: AI Normalization Step ---
        # 1. Extract all raw values from the "Channel" column first
        raw_channels = []
        channel_col_idx = headers.get("vehiculo", -1) # Assuming we found the 'vehiculo' header index
        
        if channel_col_idx >= 0:
            for row_idx in range(header_row + 1, len(df_raw)):
                val = df_raw.iloc[row_idx, channel_col_idx]
                if pd.notna(val):
                    raw_channels.append(str(val))
        
        # 2. Get the map from AI
        channel_map = smart_normalize_batch(raw_channels)
        
        # --- Processing Rows ---
        spots = []
        for row_idx in range(header_row + 1, len(df_raw)):
            row = df_raw.iloc[row_idx].tolist()
            
            # ... (Existing parsing logic) ...
            
            # Apply the AI map
            raw_channel_name = str(row[channel_col_idx]).strip()
            channel = channel_map.get(raw_channel_name, raw_channel_name)
            
            # ... (Rest of object creation) ...
            
        return spots
    except Exception as e:
        return []