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

# Import AI parser
from tools.ai_parser import (
    check_ai_availability,
    ai_parse_plan_file,
    ai_parse_execution_file,
    ai_compare_and_analyze,
)

app = FastAPI(
    title="Media Monitor Agent API",
    description="AI-powered analysis of media execution logs against planned media buys",
    version="2.0.0"
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def save_temp_file(upload_file: UploadFile) -> str:
    """Save uploaded file to temporary location and return path"""
    suffix = os.path.splitext(upload_file.filename)[1] or ".xls"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = upload_file.file.read()
        tmp.write(content)
        return tmp.name


def cleanup_temp_files(*paths: str):
    """Remove temporary files"""
    for path in paths:
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except Exception:
            pass


@app.get("/health")
async def health_check():
    """Health check endpoint - also checks AI availability"""
    ai_available, ai_error = check_ai_availability()
    
    return {
        "status": "healthy" if ai_available else "degraded",
        "timestamp": datetime.now().isoformat(),
        "service": "media-monitor-agent",
        "ai_available": ai_available,
        "ai_error": ai_error
    }


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
        
        plan_result = ai_parse_plan_file(plan_path)
        if "error" in plan_result:
            yield send_event("parsing_plan", "error", {"error": plan_result["error"]})
            return
        
        yield send_event("parsing_plan", "complete")
        
        # Stage 2: Parse Execution
        yield send_event("parsing_execution", "active")
        await asyncio.sleep(0.1)
        
        execution_result = ai_parse_execution_file(execution_path)
        if "error" in execution_result:
            yield send_event("parsing_execution", "error", {"error": execution_result["error"]})
            return
        
        yield send_event("parsing_execution", "complete")
        
        # Stage 3: Match & Compare
        yield send_event("matching", "active")
        await asyncio.sleep(0.1)
        
        # Stage 4: Generate Insights (combined with matching for efficiency)
        yield send_event("matching", "complete")
        yield send_event("generating_insights", "active")
        await asyncio.sleep(0.1)
        
        analysis_result = ai_compare_and_analyze(plan_result, execution_result)
        if "error" in analysis_result:
            yield send_event("generating_insights", "error", {"error": analysis_result["error"]})
            return
        
        yield send_event("generating_insights", "complete")
        
        # Final result
        final_result = {
            "status": "success",
            "analysis": analysis_result.get("analysis", ""),
            "metrics": analysis_result.get("metrics", {}),
            "summary": analysis_result.get("summary", {}),
            "discrepancies": analysis_result.get("discrepancies", [])[:50],
            "matched_count": analysis_result.get("summary", {}).get("matched", 0),
            "recommendations": analysis_result.get("recommendations", []),
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
        
        # Step 1: AI Parse Plan file
        plan_result = ai_parse_plan_file(plan_path)
        
        if "error" in plan_result:
            if "429" in str(plan_result["error"]) or "RESOURCE_EXHAUSTED" in str(plan_result["error"]):
                return JSONResponse(
                    status_code=503,
                    content={
                        "status": "error",
                        "error": "AI Quota Exceeded",
                        "details": "Gemini API quota has been exceeded.",
                        "ai_required": True
                    }
                )
            raise HTTPException(status_code=400, detail=f"Error parsing plan file: {plan_result['error']}")
        
        # Step 2: AI Parse Execution file
        execution_result = ai_parse_execution_file(execution_path)
        
        if "error" in execution_result:
            if "429" in str(execution_result["error"]) or "RESOURCE_EXHAUSTED" in str(execution_result["error"]):
                return JSONResponse(
                    status_code=503,
                    content={
                        "status": "error",
                        "error": "AI Quota Exceeded",
                        "details": "Gemini API quota has been exceeded.",
                        "ai_required": True
                    }
                )
            raise HTTPException(status_code=400, detail=f"Error parsing execution file: {execution_result['error']}")
        
        # Step 3: AI Compare and Analyze
        analysis_result = ai_compare_and_analyze(plan_result, execution_result)
        
        if "error" in analysis_result:
            if "429" in str(analysis_result["error"]) or "RESOURCE_EXHAUSTED" in str(analysis_result["error"]):
                return JSONResponse(
                    status_code=503,
                    content={
                        "status": "error",
                        "error": "AI Quota Exceeded",
                        "details": "Gemini API quota has been exceeded.",
                        "ai_required": True
                    }
                )
            raise HTTPException(status_code=400, detail=f"Error in AI analysis: {analysis_result['error']}")
        
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
