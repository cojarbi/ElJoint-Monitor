"""
Excel Parser Tools for Media Monitor Agent
Parses Plan (Presupuesto) and Execution (Monitoreo) Excel files
"""
import pandas as pd
from datetime import datetime
from typing import Optional
import re
import os
import json
from google import genai
from google.genai import types

from .types import PlannedSpot, AiredSpot


def get_excel_engine(file_path: str) -> str:
    """Determine the appropriate pandas engine based on file extension."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.xls':
        return 'xlrd'
    return 'openpyxl'


# Channel name normalization mapping
CHANNEL_MAPPING = {
    "TELEMETRO": "Telemetro",
    "TELEVISION NACIONAL": "TVN",
    "TVN-2": "TVN",
    "TVN": "TVN",
    "TVN 2": "TVN",
    "MEDCOM": "Telemetro",
}


def normalize_channel_name(channel: str) -> str:
    """Normalize channel name to standard format"""
    if not channel:
        return ""
    upper = channel.upper().strip()
    return CHANNEL_MAPPING.get(upper, channel.strip())


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
            model='gemini-2.0-flash',
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"AI Normalization failed: {e}. Falling back to raw names.")
        # Fallback: Map names to themselves
        return {name: name for name in unique_channels}


def parse_day_pattern(days: str) -> list[int]:
    """
    Convert day pattern to list of weekday numbers (0=Monday, 6=Sunday)
    Examples: "L-V" -> [0,1,2,3,4], "D-M" -> [6,0,1,2]
    """
    if not days:
        return []
    
    day_map = {
        "L": 0,  # Lunes (Monday)
        "M": 1,  # Martes (Tuesday) - but can also be Miércoles
        "X": 2,  # Miércoles (Wednesday)
        "J": 3,  # Jueves (Thursday)
        "V": 4,  # Viernes (Friday)
        "S": 5,  # Sábado (Saturday)
        "D": 6,  # Domingo (Sunday)
    }
    
    days = days.upper().strip()
    
    # Handle ranges like "L-V"
    if "-" in days:
        parts = days.split("-")
        if len(parts) == 2:
            start = day_map.get(parts[0].strip(), 0)
            end = day_map.get(parts[1].strip(), 4)
            if start <= end:
                return list(range(start, end + 1))
            else:
                # Wrap around (e.g., D-M = Sunday to Tuesday)
                return list(range(start, 7)) + list(range(0, end + 1))
    
    # Handle individual days like "L,M,V"
    result = []
    for day in re.split(r'[,\s]+', days):
        if day in day_map:
            result.append(day_map[day])
    
    return result if result else [0, 1, 2, 3, 4]  # Default to weekdays


def parse_plan_file(file_path: str) -> dict:
    """
    Parse the Plan (Presupuesto) Excel file.
    Extracts data from MEDCOM and TVN tabs.
    
    Args:
        file_path: Path to the Excel file
        
    Returns:
        Dictionary with channel names as keys and lists of PlannedSpot as values
    """
    try:
        engine = get_excel_engine(file_path)
        excel_file = pd.ExcelFile(file_path, engine=engine)
        result = {}
        
        # Process each relevant tab
        for sheet_name in ["MEDCOM", "TVN"]:
            if sheet_name not in excel_file.sheet_names:
                continue
            
            # Read sheet into DataFrame to find data
            df_raw = pd.read_excel(excel_file, sheet_name=sheet_name, header=None)
            spots = []
            
            # Find header row (look for "Programa" column)
            header_row = None
            headers = {}
            
            for row_idx in range(min(20, len(df_raw))):
                for col_idx in range(len(df_raw.columns)):
                    cell_value = str(df_raw.iloc[row_idx, col_idx]).lower() if pd.notna(df_raw.iloc[row_idx, col_idx]) else ""
                    if "programa" in cell_value:
                        header_row = row_idx
                        # Map column indices
                        for c_idx in range(len(df_raw.columns)):
                            val = df_raw.iloc[row_idx, c_idx]
                            if pd.notna(val):
                                headers[str(val).lower().strip()] = c_idx
                        break
                if header_row is not None:
                    break
            
            if header_row is None:
                continue
            
            # Parse data rows
            for row_idx in range(header_row + 1, len(df_raw)):
                row = df_raw.iloc[row_idx].tolist()
                if not row or pd.isna(row[0]):
                    continue
                
                # Extract fields based on header mapping
                program = None
                days = "L-V"
                time_slot = ""
                duration = 0
                
                for header, idx in headers.items():
                    if idx < len(row) and pd.notna(row[idx]):
                        value = row[idx]
                        if "programa" in header:
                            program = str(value).strip()
                        elif "día" in header or "dias" in header:
                            days = str(value).strip()
                        elif "horario" in header or "hora" in header:
                            time_slot = str(value).strip()
                        elif "duración" in header or "duracion" in header:
                            # Parse duration (could be "35ss" or just "35")
                            dur_str = str(value).strip()
                            dur_match = re.search(r'(\d+)', dur_str)
                            if dur_match:
                                duration = int(dur_match.group(1))
                
                if program and duration > 0:
                    channel = "Telemetro" if sheet_name == "MEDCOM" else "TVN"
                    spots.append(PlannedSpot(
                        channel=channel,
                        program=program,
                        days=days,
                        time_slot=time_slot,
                        duration=duration
                    ))
            
            if spots:
                result[sheet_name] = spots
        
        excel_file.close()
        return result
        
    except Exception as e:
        return {"error": str(e)}


def parse_execution_file(file_path: str, debug_log: list = None) -> list[AiredSpot]:
    """
    Parse the Execution (Monitoreo) Excel file.
    Extracts data from 'Consulta Infoanalisis' tab.
    """
    if debug_log is None: debug_log = []
    
    try:
        engine = get_excel_engine(file_path)
        excel_file = pd.ExcelFile(file_path, engine=engine)
        spots = []
        
        # Find the data sheet
        target_sheet = None
        for name in excel_file.sheet_names:
            if "consulta" in name.lower() or "infoanalisis" in name.lower():
                target_sheet = name
                break
        
        if not target_sheet:
            # Use first sheet if no match
            target_sheet = excel_file.sheet_names[0]
        
        msg = f"Using sheet '{target_sheet}' from: {excel_file.sheet_names}"
        print(f"DEBUG: {msg}", flush=True)
        debug_log.append(msg)
        
        # Read sheet into DataFrame
        df_raw = pd.read_excel(excel_file, sheet_name=target_sheet, header=None)
        
        shape_msg = f"DataFrame shape: {df_raw.shape}"
        print(f"DEBUG: {shape_msg}", flush=True)
        debug_log.append(shape_msg)
        # debug_log.append(f"Head: {df_raw.head(3).to_string()}") # Optional: too verbose for error msg?
        
        # Find header row
        header_row = None
        headers = {}
        
        for row_idx in range(min(20, len(df_raw))):
            for col_idx in range(len(df_raw.columns)):
                cell_value = str(df_raw.iloc[row_idx, col_idx]).lower() if pd.notna(df_raw.iloc[row_idx, col_idx]) else ""
                # Expanded keywords for robustness
                if ("vehiculo" in cell_value or "canal" in cell_value or "medio" in cell_value) and \
                   ("soporte" in cell_value or "programa" in cell_value) and \
                   ("fecha" in cell_value):
                    header_row = row_idx
                    for c_idx in range(len(df_raw.columns)):
                        val = df_raw.iloc[row_idx, c_idx]
                        if pd.notna(val):
                            headers[str(val).lower().strip()] = c_idx
                    break
                # Fallback: check for just a few key columns if strict match fails
                elif "vehiculo" in cell_value or "soporte" in cell_value or "fecha" in cell_value:
                     # Potential header candidate
                     header_row = row_idx
            
            if header_row is not None:
                # Validate this row actually looks like a header (has multiple expected columns)
                temp_headers = {}
                for c_idx in range(len(df_raw.columns)):
                    val = df_raw.iloc[row_idx, c_idx]
                    if pd.notna(val):
                        temp_headers[str(val).lower().strip()] = c_idx
                
                has_channel = any(k for k in temp_headers if "vehiculo" in k or "canal" in k or "medio" in k)
                has_program = any(k for k in temp_headers if "soporte" in k or "programa" in k)
                
                if has_channel or has_program:
                    headers = temp_headers
                    break
                else:
                    header_row = None # False positive

        log_msg = f"Header row: {header_row}. Headers found: {list(headers.keys())}"
        print(f"DEBUG: {log_msg}", flush=True)
        debug_log.append(log_msg)
        
        if header_row is None:
            debug_log.append("No header row found matching keywords")
            return []

        # --- NEW: AI Normalization Step ---
        # 1. Extract all raw values from the "Channel" column first
        raw_channels = []
        channel_col_idx = -1
        
        # Find channel column index from headers
        for h, idx in headers.items():
            if "vehiculo" in h:
                channel_col_idx = idx
                break
        
        if channel_col_idx == -1:
             # Try alternatives
             for h, idx in headers.items():
                if "canal" in h or "medio" in h:
                    channel_col_idx = idx
                    break

        if channel_col_idx >= 0:
            for row_idx in range(header_row + 1, len(df_raw)):
                val = df_raw.iloc[row_idx, channel_col_idx]
                if pd.notna(val):
                    raw_channels.append(str(val))
        
        # 2. Get the map from AI
        channel_map = smart_normalize_batch(raw_channels)
        
        # Parse data rows
        for row_idx in range(header_row + 1, len(df_raw)):
            row = df_raw.iloc[row_idx].tolist()
            if not row:
                continue
            
            channel = None
            program = None
            date = None
            duration = 0
            
            for header, idx in headers.items():
                if idx < len(row) and pd.notna(row[idx]):
                    value = row[idx]
                    if "vehiculo" in header or "canal" in header or "medio" in header:
                        # Apply the AI map
                        raw_channel_name = str(value).strip()
                        channel = channel_map.get(raw_channel_name, raw_channel_name)
                    elif "soporte" in header or "programa" in header:
                        program = str(value).strip()
                    elif "fecha" in header:
                        # Parse date (YYYYMMDD format)
                        date_str = str(value).strip()
                        if len(date_str) >= 8:
                            try:
                                date = datetime.strptime(date_str[:8], "%Y%m%d")
                            except ValueError:
                                try:
                                    # Try other formats
                                    date = datetime.strptime(date_str, "%d/%m/%Y")
                                except ValueError:
                                    pass
                    elif "duración" in header or "duracion" in header:
                        try:
                            duration = int(float(value))
                        except (ValueError, TypeError):
                            pass
            
            if channel and program:
                spots.append(AiredSpot(
                    channel=channel,
                    program=program,
                    date=date,
                    duration=duration
                ))
        
        excel_file.close()
        return spots
        
    except Exception as e:
        msg = f"DEBUG: Error parsing execution file: {str(e)}"
        print(msg)
        debug_log.append(msg)
        import traceback
        traceback.print_exc()
        return []


# Tool functions for ADK
def parse_plan_file_tool(file_path: str) -> str:
    """
    Parse the Plan (Presupuesto) Excel file to extract planned advertising spots.
    
    Args:
        file_path: Path to the Plan Excel file (.xls or .xlsx)
        
    Returns:
        JSON string with parsed planned spots grouped by channel
    """
    import json
    result = parse_plan_file(file_path)
    
    if "error" in result:
        return json.dumps({"error": result["error"]})
    
    output = {}
    total_spots = 0
    for sheet_name, spots in result.items():
        output[sheet_name] = [s.to_dict() for s in spots]
        total_spots += len(spots)
    
    return json.dumps({
        "success": True,
        "total_planned_spots": total_spots,
        "data": output
    }, indent=2)


def parse_execution_file_tool_v2(file_path: str) -> str:
    """
    Parse the Execution (Monitoreo) Excel file to extract actually aired spots.
    
    Args:
        file_path: Path to the Execution Excel file (.xls or .xlsx)
        
    Returns:
        JSON string with parsed aired spots
    """
    import json
    # Capture debug info to return in case of error
    debug_info = []
    
    try:
        spots = parse_execution_file(file_path, debug_log=debug_info)
    except Exception as e:
         return json.dumps({"error": f"Parser Error: {str(e)} | Debug: {'; '.join(debug_info)}"})
    
    if not spots:
        return json.dumps({"error": f"ERROR_V2: No spots found in execution file. Debug: {'; '.join(debug_info)}"})
    
    return json.dumps({
        "success": True,
        "total_aired_spots": len(spots),
        "data": [s.to_dict() for s in spots]
    }, indent=2)
