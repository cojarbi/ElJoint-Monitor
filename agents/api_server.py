"""
FastAPI Server for Media Monitor Agent
AI-Only Architecture - Uses Google Gemini for all analysis
Includes SSE streaming for pipeline progress updates
"""
import os
import json
import tempfile
import asyncio
from datetime import datetime
from typing import AsyncGenerator
from dotenv import load_dotenv

# Load environment variables from parent .env file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from tools.spot_matcher import match_spots_tool
from tools.metrics_calculator import calculate_metrics_tool
from tools.report_generator import generate_report_tool
from tools.metrics_calculator import calculate_metrics_tool
from tools.report_generator import generate_report_tool
import tools.excel_parser
import importlib
importlib.reload(tools.excel_parser)
print(f"DEBUG: Loaded tools.excel_parser from: {tools.excel_parser.__file__}")
from tools.excel_parser import parse_plan_file_tool, parse_execution_file_tool_v2

# Initialize FastAPI app
app = FastAPI(title="Media Monitor API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def check_ai_availability():
    """Check if AI service is configured and available"""
    if os.environ.get("GOOGLE_API_KEY"):
        return True, None
    return False, "GOOGLE_API_KEY not found in environment"

def save_temp_file(upload_file: UploadFile) -> str:
    """Save uploaded file to temporary file"""
    try:
        suffix = os.path.splitext(upload_file.filename)[1]
        fd, path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, 'wb') as tmp:
            chunk = upload_file.file.read()
            tmp.write(chunk)
        return path
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

def cleanup_temp_files(*paths):
    """Remove temporary files"""
    for path in paths:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except:
                pass

async def generate_analysis_stream(plan_path: str, execution_path: str) -> AsyncGenerator[str, None]:
    """Stream analysis progress as Server-Sent Events"""
    
    def send_event(stage: str, status: str, data: dict = None):
        event_data = {"stage": stage, "status": status}
        if data:
            event_data["data"] = data
        return f"data: {json.dumps(event_data)}\n\n"
    
    try:
        # Stage 1: Parse Plan
        yield send_event("parsing_plan", "active")
        await asyncio.sleep(0.1)  # Small delay for UI to catch up
        
        # Parse Plan File
        plan_json = parse_plan_file_tool(plan_path)
        plan_result = json.loads(plan_json)
        
        if "error" in plan_result:
            yield send_event("parsing_plan", "error", {"error": plan_result["error"]})
            return
        
        yield send_event("parsing_plan", "complete")
        
        # Stage 2: Parse Execution
        yield send_event("parsing_execution", "active")
        await asyncio.sleep(0.1)
        
        # Parse Execution File
        execution_json = parse_execution_file_tool_v2(execution_path)
        execution_result = json.loads(execution_json)
        
        if "error" in execution_result:
            yield send_event("parsing_execution", "error", {"error": execution_result["error"]})
            return
        
        yield send_event("parsing_execution", "complete")
        
        # Stage 3: Match Spots
        yield send_event("matching", "active")
        await asyncio.sleep(0.1)
        
        # Use deterministic matching tool
        # Note: Match tool expects JSON strings as input
        match_result_json = match_spots_tool(
            json.dumps(plan_result), 
            json.dumps(execution_result)
        )
        match_result = json.loads(match_result_json)
        
        if "error" in match_result:
            yield send_event("matching", "error", {"error": match_result["error"]})
            return
            
        yield send_event("matching", "complete")
        
        # Stage 4: Calculate Metrics
        yield send_event("calculating_metrics", "active")
        await asyncio.sleep(0.1)
        
        metrics_result_json = calculate_metrics_tool(match_result_json)
        metrics_result = json.loads(metrics_result_json)
        
        if "error" in metrics_result:
            yield send_event("calculating_metrics", "error", {"error": metrics_result["error"]})
            return
            
        yield send_event("calculating_metrics", "complete")
        
        # Stage 5: Generate Report
        yield send_event("generating_report", "active")
        await asyncio.sleep(0.1)
        
        # Generate final report
        # We can add a small AI step here if we want "AI Insights", 
        # but for now we'll use the deterministic report generator
        final_report_json = generate_report_tool(
            metrics_result_json, 
            match_result_json,
            ai_insights="Automated analysis completed successfully."
        )
        final_report = json.loads(final_report_json)
        
        if "error" in final_report:
            yield send_event("generating_report", "error", {"error": final_report["error"]})
            return
            
        yield send_event("generating_report", "complete")
        
        # Final result structure expected by frontend
        final_result = {
            "status": "success",
            "analysis": "Analysis completed using granular tools.", # Placeholder or generated text
            "metrics": final_report.get("metrics", {}),
            "summary": final_report.get("summary", {}),
            "discrepancies": final_report.get("discrepancies", []),
            "matched_count": final_report.get("summary", {}).get("matched", 0),
            "recommendations": final_report.get("recommendations", []),
            "ai_powered": True
        }
        
        yield send_event("complete", "complete", final_result)
        
    except Exception as e:
        yield send_event("error", "error", {"error": str(e)})
    finally:
        cleanup_temp_files(plan_path, execution_path)


@app.post("/analyze-stream")
async def analyze_media_stream(
    plan_file: UploadFile = File(..., description="Plan (Presupuesto) Excel file"),
    execution_file: UploadFile = File(..., description="Execution (Monitoreo) Excel file")
):
    """
    Analyze media execution with streaming progress updates via SSE.
    Returns Server-Sent Events for real-time pipeline progress.
    """
    # First, check if AI is available
    ai_available, ai_error = check_ai_availability()
    if not ai_available:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "error": "AI Service Unavailable",
                "details": ai_error,
                "ai_required": True
            }
        )
    
    # Validate file types
    for f in [plan_file, execution_file]:
        if not f.filename.endswith(('.xls', '.xlsx')):
            return JSONResponse(
                status_code=400,
                content={
                    "status": "error",
                    "error": f"Invalid file type for {f.filename}. Only .xls and .xlsx files are supported."
                }
            )
    
    # Save uploaded files temporarily
    plan_path = save_temp_file(plan_file)
    execution_path = save_temp_file(execution_file)
    
    # Return streaming response
    return StreamingResponse(
        generate_analysis_stream(plan_path, execution_path),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.post("/analyze")
async def analyze_media(
    plan_file: UploadFile = File(..., description="Plan (Presupuesto) Excel file"),
    execution_file: UploadFile = File(..., description="Execution (Monitoreo) Excel file")
):
    """
    Analyze media execution logs against planned media buys using AI.
    Non-streaming version - returns complete results when done.
    """
    # First, check if AI is available
    ai_available, ai_error = check_ai_availability()
    if not ai_available:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "error": "AI Service Unavailable",
                "details": ai_error,
                "ai_required": True
            }
        )
    
    plan_path = None
    execution_path = None
    
    try:
        # Validate file types
        for f in [plan_file, execution_file]:
            if not f.filename.endswith(('.xls', '.xlsx')):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid file type for {f.filename}. Only .xls and .xlsx files are supported."
                )
        
        # Save uploaded files temporarily
        plan_path = save_temp_file(plan_file)
        execution_path = save_temp_file(execution_file)
        
        # Step 1: Parse Plan file
        plan_json = parse_plan_file_tool(plan_path)
        plan_result = json.loads(plan_json)
        
        if "error" in plan_result:
            raise HTTPException(status_code=400, detail=f"Error parsing plan file: {plan_result['error']}")
        
        # Step 2: Parse Execution file
        execution_json = parse_execution_file_tool_v2(execution_path)
        execution_result = json.loads(execution_json)
        
        if "error" in execution_result:
            raise HTTPException(status_code=400, detail=f"Error parsing execution file: {execution_result['error']}")
        
        # Step 3: Match and Analyze
        match_result_json = match_spots_tool(
            json.dumps(plan_result), 
            json.dumps(execution_result)
        )
        match_result = json.loads(match_result_json)
        
        if "error" in match_result:
             raise HTTPException(status_code=400, detail=f"Error in matching: {match_result['error']}")

        # Step 4: Metrics
        metrics_result_json = calculate_metrics_tool(match_result_json)
        
        # Step 5: Report
        final_report_json = generate_report_tool(
            metrics_result_json, 
            match_result_json,
            ai_insights="Automated analysis completed successfully."
        )
        analysis_result = json.loads(final_report_json)
        
        # Return successful analysis
        return JSONResponse(content={
            "status": "success",
            "analysis": analysis_result.get("analysis", ""),
            "metrics": analysis_result.get("metrics", {}),
            "summary": analysis_result.get("summary", {}),
            "discrepancies": analysis_result.get("discrepancies", [])[:50],
            "matched_count": analysis_result.get("summary", {}).get("matched", 0),
            "recommendations": analysis_result.get("recommendations", []),
            "ai_powered": True
        })
        
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "error",
                    "error": "AI Quota Exceeded",
                    "details": "Gemini API quota has been exceeded.",
                    "ai_required": True
                }
            )
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_temp_files(plan_path, execution_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
