"""
AI-Powered Excel Parser using Google Gemini
Dynamically understands any Excel structure without hardcoded patterns
"""
import os
import pandas as pd
import json
from typing import Optional

from google import genai
from google.genai import types


def get_excel_engine(file_path: str) -> str:
    """Determine the appropriate pandas engine based on file extension."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.xls':
        return 'xlrd'
    return 'openpyxl'


def excel_to_text(file_path: str, max_rows: int = 100) -> str:
    """
    Convert Excel file to text representation for AI analysis.
    Includes sheet names and a sample of data from each sheet.
    """
    engine = get_excel_engine(file_path)
    excel_file = pd.ExcelFile(file_path, engine=engine)
    
    output = []
    output.append(f"Excel file with {len(excel_file.sheet_names)} sheets: {excel_file.sheet_names}\n")
    
    for sheet_name in excel_file.sheet_names:
        df = pd.read_excel(excel_file, sheet_name=sheet_name, header=None, nrows=max_rows)
        output.append(f"\n=== Sheet: {sheet_name} ===")
        output.append(df.to_string(max_rows=max_rows, max_cols=15))
    
    excel_file.close()
    return "\n".join(output)


def check_ai_availability() -> tuple[bool, Optional[str]]:
    """
    Check if AI (Gemini) is available.
    Returns (is_available, error_message)
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return False, "GOOGLE_API_KEY not configured. Please add your Gemini API key to the .env file."
    
    # Test the connection with a minimal request
    try:
        client = genai.Client()
        response = client.models.generate_content(
            model='gemini-3.0-flash',
            contents='Reply with just the word "OK"',
            config=types.GenerateContentConfig(
                max_output_tokens=10,
            )
        )
        return True, None
    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            return False, "Gemini API quota exceeded. Please check your billing settings or wait for quota reset."
        elif "401" in error_str or "403" in error_str:
            return False, "Invalid Gemini API key. Please verify your GOOGLE_API_KEY is correct."
        else:
            return False, f"Gemini API error: {error_str}"


def ai_parse_plan_file(file_path: str) -> dict:
    """
    Use AI to parse the Plan (Presupuesto) Excel file.
    Dynamically understands any Excel structure.
    """
    # Convert Excel to text for AI analysis
    excel_text = excel_to_text(file_path, max_rows=50)
    
    prompt = f"""You are analyzing a media plan (Presupuesto) Excel file for advertising spot placements.

Analyze this Excel data and extract ALL planned advertising spots:

{excel_text}

For EACH planned spot, extract:
- channel: The TV channel (e.g., "TVN", "Telemetro", "TVN-2", "MEDCOM")
- program: The TV program name (e.g., "Noticiero Matutino", "Jelou")
- days: When it airs (e.g., "L-V" for Mon-Fri, "M-D" for Tue-Sun)
- time_slot: The time range (e.g., "6:00am-08:00am")
- duration: Spot duration in seconds (extract the number from "35ss" or "10ss")

Rules:
- Look for rows that have a program name in the first column and timing/duration info
- Skip header rows, totals, and summary rows
- Include spots from ALL relevant sheets (MEDCOM, TVN, etc.)
- Normalize channel names: "TVN - 2" or "TVN-2" should become "TVN"

Return ONLY a valid JSON object with this structure:
{{
    "planned_spots": [
        {{"channel": "...", "program": "...", "days": "...", "time_slot": "...", "duration": 35}},
        ...
    ],
    "total_spots": <number>
}}"""

    try:
        client = genai.Client()
        response = client.models.generate_content(
            model='gemini-3.0-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,  # Low temperature for consistent parsing
                response_mime_type="application/json",
            )
        )
        
        result = json.loads(response.text)
        return {"success": True, **result}
        
    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse AI response as JSON: {e}"}
    except Exception as e:
        return {"error": str(e)}


def ai_parse_execution_file(file_path: str) -> dict:
    """
    Use AI to parse the Execution (Monitoreo) Excel file.
    Dynamically understands any Excel structure.
    """
    excel_text = excel_to_text(file_path, max_rows=100)
    
    prompt = f"""You are analyzing a media execution log (Monitoreo) Excel file that records actually aired TV spots.

Analyze this Excel data and extract ALL aired advertising spots:

{excel_text}

For EACH aired spot, extract:
- channel: The TV channel name (normalize: "TELEVISION NACIONAL" → "TVN", "TELEMETRO" stays as "Telemetro")
- program: The TV program name where the ad aired
- date: The air date in ISO format (YYYY-MM-DD)
- duration: Spot duration in seconds

Rules:
- Look for the data rows (not headers) that contain channel, program, and date information
- The "Vehiculo" column typically contains the channel name
- The "Soporte" column typically contains the program name
- Dates might be in format YYYYMMDD (e.g., 20251202) - convert to ISO format
- Skip rows without channel or program data

Return ONLY a valid JSON object with this structure:
{{
    "aired_spots": [
        {{"channel": "...", "program": "...", "date": "2025-12-02", "duration": 35}},
        ...
    ],
    "total_spots": <number>
}}"""

    try:
        client = genai.Client()
        response = client.models.generate_content(
            model='gemini-3.0-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json",
            )
        )
        
        result = json.loads(response.text)
        return {"success": True, **result}
        
    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse AI response as JSON: {e}"}
    except Exception as e:
        return {"error": str(e)}


def ai_compare_and_analyze(plan_data: dict, execution_data: dict) -> dict:
    """
    Use AI to compare planned vs executed spots and generate insights.
    """
    prompt = f"""You are a media analyst comparing planned advertising spots against actual execution.

PLANNED SPOTS (what was ordered):
{json.dumps(plan_data.get('planned_spots', [])[:30], indent=2)}
Total planned: {plan_data.get('total_spots', len(plan_data.get('planned_spots', [])))}

AIRED SPOTS (what actually ran):
{json.dumps(execution_data.get('aired_spots', [])[:30], indent=2)}
Total aired: {execution_data.get('total_spots', len(execution_data.get('aired_spots', [])))}

Analyze the campaign execution:

1. **Match spots**: For each planned spot, try to find corresponding aired spots
   - Match by channel + program (fuzzy match OK - e.g., "Jelou" matches "JELOU")
   - Consider the days and time slots when matching
   
2. **Identify discrepancies**:
   - Under-delivery: Planned spots that didn't air
   - Over-delivery: Spots that aired but weren't in the plan (bonus spots)
   - Wrong duration: Spots that aired with different duration
   - Wrong time: Spots that aired at wrong time

3. **Calculate metrics**:
   - Delivery rate: (matched spots / planned spots) × 100
   - Match accuracy: How well executed spots align with plan

4. **Generate insights**: Natural language analysis of the campaign performance

Return ONLY a valid JSON object:
{{
    "analysis": "Markdown-formatted insights about campaign performance...",
    "metrics": {{
        "delivery_rate": {{"value": 95.5, "label": "Delivery Rate", "status": "good|warning|critical"}},
        "matched_count": {{"value": 42, "label": "Matched Spots"}},
        "under_delivered": {{"value": 3, "label": "Under-Delivered", "status": "..."}},
        "over_delivered": {{"value": 5, "label": "Over-Delivered"}}
    }},
    "summary": {{
        "total_planned": <number>,
        "total_aired": <number>,
        "matched": <number>,
        "unmatched_planned": <number>,
        "unmatched_aired": <number>
    }},
    "discrepancies": [
        {{"type": "under_delivery|over_delivery|wrong_duration|wrong_time", "severity": "high|medium|low", "channel": "...", "program": "...", "expected": "...", "actual": "...", "explanation": "..."}}
    ],
    "recommendations": ["Action item 1", "Action item 2"]
}}"""

    try:
        client = genai.Client()
        response = client.models.generate_content(
            model='gemini-3.0-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
                response_mime_type="application/json",
            )
        )
        
        result = json.loads(response.text)
        return {"success": True, **result}
        
    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse AI response as JSON: {e}"}
    except Exception as e:
        return {"error": str(e)}
