"""
Excel Parser Tools for Media Monitor Agent
Parses Plan (Presupuesto) and Execution (Monitoreo) Excel files
"""
import pandas as pd
from datetime import datetime
from typing import Optional
import re
import os

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


def parse_execution_file(file_path: str) -> list[AiredSpot]:
    """
    Parse the Execution (Monitoreo) Excel file.
    Extracts data from 'Consulta Infoanalisis' tab.
    
    Args:
        file_path: Path to the Excel file
        
    Returns:
        List of AiredSpot objects
    """
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
        
        # Read sheet into DataFrame
        df_raw = pd.read_excel(excel_file, sheet_name=target_sheet, header=None)
        
        # Find header row
        header_row = None
        headers = {}
        
        for row_idx in range(min(20, len(df_raw))):
            for col_idx in range(len(df_raw.columns)):
                cell_value = str(df_raw.iloc[row_idx, col_idx]).lower() if pd.notna(df_raw.iloc[row_idx, col_idx]) else ""
                if "vehiculo" in cell_value or "soporte" in cell_value or "fecha" in cell_value:
                    header_row = row_idx
                    for c_idx in range(len(df_raw.columns)):
                        val = df_raw.iloc[row_idx, c_idx]
                        if pd.notna(val):
                            headers[str(val).lower().strip()] = c_idx
                    break
            if header_row is not None:
                break
        
        if header_row is None:
            return []
        
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
                    if "vehiculo" in header:
                        channel = normalize_channel_name(str(value))
                    elif "soporte" in header:
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


def parse_execution_file_tool(file_path: str) -> str:
    """
    Parse the Execution (Monitoreo) Excel file to extract actually aired spots.
    
    Args:
        file_path: Path to the Execution Excel file (.xls or .xlsx)
        
    Returns:
        JSON string with parsed aired spots
    """
    import json
    spots = parse_execution_file(file_path)
    
    if not spots:
        return json.dumps({"error": "No spots found in execution file"})
    
    return json.dumps({
        "success": True,
        "total_aired_spots": len(spots),
        "data": [s.to_dict() for s in spots]
    }, indent=2)
