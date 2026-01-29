"""
Report Generator Tool for Media Monitor Agent
Generates structured analysis reports
"""
import json
from typing import Any


def generate_report_tool(
    metrics_json: str,
    match_result_json: str,
    ai_insights: str = ""
) -> str:
    """
    Generate a comprehensive analysis report.
    
    Args:
        metrics_json: JSON string from calculate_metrics tool
        match_result_json: JSON string from match_spots tool
        ai_insights: Natural language insights from the LLM
        
    Returns:
        JSON string with complete structured report
    """
    try:
        metrics_data = json.loads(metrics_json)
        match_data = json.loads(match_result_json)
        
        if "error" in metrics_data:
            return json.dumps({"error": metrics_data["error"]})
        
        if "error" in match_data:
            return json.dumps({"error": match_data["error"]})
        
        metrics = metrics_data.get("metrics", {})
        summary = match_data.get("summary", {})
        data = match_data.get("data", {})
        
        # Generate recommendations based on metrics
        recommendations = []
        
        delivery_rate = metrics.get("delivery_rate", {}).get("value", 0)
        under_delivered = metrics.get("under_delivered", {}).get("value", 0)
        over_delivered = metrics.get("over_delivered", {}).get("value", 0)
        
        if under_delivered > 0:
            recommendations.append(
                f"Follow up with media company regarding {under_delivered} missing spot(s) that were planned but did not air"
            )
        
        if over_delivered > summary.get("total_planned", 0) * 0.1:
            recommendations.append(
                f"Investigate {over_delivered} over-delivered spots to verify if they are bonus placements or data attribution errors"
            )
        
        if delivery_rate < 95:
            recommendations.append(
                f"Request make-goods or credits for {100 - delivery_rate:.1f}% under-delivery"
            )
        
        if delivery_rate >= 98:
            recommendations.append(
                "Excellent delivery rate! Consider this media partner for future campaigns"
            )
        
        # Count discrepancies by type
        discrepancy_summary = {}
        for disc in data.get("discrepancies", []):
            disc_type = disc.get("type", "unknown")
            discrepancy_summary[disc_type] = discrepancy_summary.get(disc_type, 0) + 1
        
        report = {
            "success": True,
            "generated_at": __import__("datetime").datetime.now().isoformat(),
            "summary": {
                "delivery_rate": delivery_rate,
                "total_planned": summary.get("total_planned", 0),
                "total_aired": summary.get("total_aired", 0),
                "matched": summary.get("matched", 0),
                "over_delivered": over_delivered,
                "under_delivered": under_delivered,
                "discrepancy_count": len(data.get("discrepancies", []))
            },
            "metrics": metrics,
            "discrepancy_summary": discrepancy_summary,
            "discrepancies": data.get("discrepancies", [])[:20],  # Top 20 discrepancies
            "matched_spots": data.get("matched", [])[:50],  # Sample of matched spots
            "ai_insights": ai_insights,
            "recommendations": recommendations
        }
        
        return json.dumps(report, indent=2)
        
    except Exception as e:
        return json.dumps({"error": str(e)})
