"""
FastAPI Server for Media Monitor Agent
Exposes the ADK agent via REST API
"""
import os
import tempfile
import json
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Import tools directly for non-ADK mode
from tools import (
    parse_plan_file_tool,
    parse_execution_file_tool,
    match_spots_tool,
    calculate_metrics_tool,
    generate_report_tool
)

app = FastAPI(
    title="Media Monitor Agent API",
    description="API for analyzing media execution logs against planned media buys",
    version="1.0.0"
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
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "media-monitor-agent"
    }


@app.post("/analyze")
async def analyze_media(
    plan_file: UploadFile = File(..., description="Plan (Presupuesto) Excel file"),
    execution_file: UploadFile = File(..., description="Execution (Monitoreo) Excel file")
):
    """
    Analyze media execution logs against planned media buys.
    
    Accepts two Excel files:
    - plan_file: The Presupuesto file with planned spots
    - execution_file: The Monitoreo file with aired spots
    
    Returns comprehensive analysis with metrics, discrepancies, and AI insights.
    """
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
        plan_result = parse_plan_file_tool(plan_path)
        plan_data = json.loads(plan_result)
        
        if "error" in plan_data:
            raise HTTPException(
                status_code=400,
                detail=f"Error parsing plan file: {plan_data['error']}"
            )
        
        # Step 2: Parse Execution file
        execution_result = parse_execution_file_tool(execution_path)
        execution_data = json.loads(execution_result)
        
        if "error" in execution_data:
            raise HTTPException(
                status_code=400,
                detail=f"Error parsing execution file: {execution_data['error']}"
            )
        
        # Step 3: Match spots
        match_result = match_spots_tool(plan_result, execution_result)
        match_data = json.loads(match_result)
        
        if "error" in match_data:
            raise HTTPException(
                status_code=400,
                detail=f"Error matching spots: {match_data['error']}"
            )
        
        # Step 4: Calculate metrics
        metrics_result = calculate_metrics_tool(match_result)
        metrics_data = json.loads(metrics_result)
        
        if "error" in metrics_data:
            raise HTTPException(
                status_code=400,
                detail=f"Error calculating metrics: {metrics_data['error']}"
            )
        
        # Step 5: Generate AI insights
        summary = match_data.get("summary", {})
        metrics = metrics_data.get("metrics", {})
        
        delivery_rate = metrics.get("delivery_rate", {}).get("value", 0)
        total_planned = summary.get("total_planned", 0)
        total_aired = summary.get("total_aired", 0)
        matched = summary.get("matched", 0)
        under_delivered = summary.get("unmatched_planned", 0)
        over_delivered = summary.get("unmatched_aired", 0)
        
        # Generate AI-like insights (structured analysis)
        ai_insights = generate_insights(
            delivery_rate, total_planned, total_aired, matched,
            under_delivered, over_delivered, match_data.get("data", {})
        )
        
        # Step 6: Generate final report
        report_result = generate_report_tool(metrics_result, match_result, ai_insights)
        report_data = json.loads(report_result)
        
        return JSONResponse(content={
            "status": "success",
            "analysis": ai_insights,
            "metrics": metrics_data.get("metrics", {}),
            "summary": summary,
            "discrepancies": match_data.get("data", {}).get("discrepancies", [])[:50],
            "matched_count": matched,
            "recommendations": report_data.get("recommendations", [])
        })
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_temp_files(plan_path, execution_path)


def generate_insights(
    delivery_rate: float,
    total_planned: int,
    total_aired: int,
    matched: int,
    under_delivered: int,
    over_delivered: int,
    match_data: dict
) -> str:
    """Generate natural language insights from the analysis data"""
    
    # Determine overall performance
    if delivery_rate >= 98:
        performance = "excellent"
        emoji = "🟢"
    elif delivery_rate >= 95:
        performance = "strong"
        emoji = "🟢"
    elif delivery_rate >= 85:
        performance = "acceptable"
        emoji = "🟡"
    else:
        performance = "concerning"
        emoji = "🔴"
    
    insights = f"""{emoji} **Campaign Performance: {performance.title()}**

The campaign achieved a **{delivery_rate:.1f}% delivery rate**, with {matched} out of {total_planned} planned spots successfully matched to aired spots.

**Key Findings:**
"""
    
    if under_delivered > 0:
        insights += f"\n• **Under-delivery ({under_delivered} spots):** {under_delivered} planned spots did not air as expected. This represents a {(under_delivered/total_planned*100):.1f}% shortfall that should be addressed with the media company."
    
    if over_delivered > 0:
        if over_delivered > total_planned * 0.5:
            insights += f"\n• **Significant over-delivery ({over_delivered} spots):** The monitoring data shows {over_delivered} additional spots beyond the plan. This could indicate bonus spots, a different campaign included in the data, or an extended campaign period."
        else:
            insights += f"\n• **Over-delivery ({over_delivered} spots):** {over_delivered} spots aired without a matching plan entry. These may be bonus placements from the media company."
    
    if delivery_rate >= 95 and under_delivered == 0:
        insights += "\n• **Perfect execution:** All planned spots were delivered as expected. Consider this media partner for future campaigns."
    
    # Add discrepancy analysis
    discrepancies = match_data.get("discrepancies", [])
    if discrepancies:
        disc_types = {}
        for d in discrepancies:
            disc_type = d.get("type", "unknown")
            disc_types[disc_type] = disc_types.get(disc_type, 0) + 1
        
        insights += "\n\n**Discrepancy Breakdown:**"
        for disc_type, count in sorted(disc_types.items(), key=lambda x: x[1], reverse=True):
            insights += f"\n• {disc_type.replace('_', ' ').title()}: {count}"
    
    return insights


@app.post("/analyze-adk")
async def analyze_media_with_adk(
    plan_file: UploadFile = File(...),
    execution_file: UploadFile = File(...)
):
    """
    Analyze using Google ADK agent (requires GOOGLE_API_KEY).
    Falls back to standard analysis if ADK not configured.
    """
    # Check for API key
    if not os.environ.get("GOOGLE_API_KEY"):
        # Fall back to standard analysis
        return await analyze_media(plan_file, execution_file)
    
    plan_path = None
    execution_path = None
    
    try:
        # Import ADK agent
        from media_monitor_agent import run_analysis
        
        plan_path = save_temp_file(plan_file)
        execution_path = save_temp_file(execution_file)
        
        result = run_analysis(plan_path, execution_path)
        
        return JSONResponse(content=result)
        
    except ImportError:
        # ADK not available, fall back
        return await analyze_media(plan_file, execution_file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_temp_files(plan_path, execution_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
