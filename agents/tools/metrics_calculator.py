"""
Metrics Calculator Tool for Media Monitor Agent
Calculates accuracy metrics from match results
"""
import json
from .types import Metrics, MatchResult, MatchedSpot, DiscrepancyType


def calculate_delivery_rate(matched: int, total_planned: int) -> float:
    """Calculate delivery rate as percentage"""
    if total_planned == 0:
        return 100.0
    return round((matched / total_planned) * 100, 2)


def calculate_accuracy(correct: int, total: int) -> float:
    """Calculate accuracy as percentage"""
    if total == 0:
        return 100.0
    return round((correct / total) * 100, 2)


def calculate_metrics_from_result(match_result: MatchResult, total_planned: int, total_aired: int) -> Metrics:
    """
    Calculate all metrics from a MatchResult.
    
    Args:
        match_result: The result of spot matching
        total_planned: Total number of planned spots
        total_aired: Total number of aired spots
        
    Returns:
        Metrics object with all calculated values
    """
    matched_count = len(match_result.matched)
    
    # Delivery rate: how many planned spots were actually delivered
    delivery_rate = calculate_delivery_rate(matched_count, total_planned)
    
    # Over/under delivery
    over_delivered = len(match_result.unmatched_aired)
    under_delivered = len(match_result.unmatched_planned)
    
    # Program accuracy: how many matched spots had good program name matches
    high_program_matches = sum(1 for m in match_result.matched if m.match_score >= 0.95)
    program_accuracy = calculate_accuracy(high_program_matches, matched_count)
    
    # Duration accuracy: spots where duration matched exactly or within 1 second
    exact_duration = sum(
        1 for m in match_result.matched 
        if abs(m.planned.duration - m.aired.duration) <= 1
    )
    duration_accuracy = calculate_accuracy(exact_duration, matched_count)
    
    # Channel accuracy: for matched spots, channel is always correct (it's a filter)
    channel_accuracy = 100.0 if matched_count > 0 else 100.0
    
    return Metrics(
        delivery_rate=delivery_rate,
        total_planned=total_planned,
        total_aired=total_aired,
        matched=matched_count,
        over_delivered=over_delivered,
        under_delivered=under_delivered,
        program_accuracy=program_accuracy,
        duration_accuracy=duration_accuracy,
        channel_accuracy=channel_accuracy
    )


def calculate_metrics_tool(match_result_json: str) -> str:
    """
    Calculate accuracy metrics from match results.
    
    Args:
        match_result_json: JSON string from match_spots tool
        
    Returns:
        JSON string with calculated metrics
    """
    try:
        data = json.loads(match_result_json)
        
        if "error" in data:
            return json.dumps({"error": data["error"]})
        
        summary = data.get("summary", {})
        match_data = data.get("data", {})
        
        total_planned = summary.get("total_planned", 0)
        total_aired = summary.get("total_aired", 0)
        matched_count = summary.get("matched", 0)
        
        # Calculate delivery rate
        delivery_rate = calculate_delivery_rate(matched_count, total_planned)
        
        # Over/under delivery
        over_delivered = summary.get("unmatched_aired", 0)
        under_delivered = summary.get("unmatched_planned", 0)
        
        # Calculate accuracies from matched data
        matched_spots = match_data.get("matched", [])
        
        # Program accuracy
        high_program_matches = sum(1 for m in matched_spots if m.get("match_score", 0) >= 0.95)
        program_accuracy = calculate_accuracy(high_program_matches, matched_count)
        
        # Duration accuracy
        exact_duration = sum(
            1 for m in matched_spots 
            if abs(m.get("planned", {}).get("duration", 0) - m.get("aired", {}).get("duration", 0)) <= 1
        )
        duration_accuracy = calculate_accuracy(exact_duration, matched_count)
        
        # Determine status color coding
        def get_status(value: float) -> str:
            if value >= 95:
                return "excellent"
            elif value >= 85:
                return "good"
            elif value >= 70:
                return "warning"
            else:
                return "critical"
        
        metrics = {
            "delivery_rate": {
                "value": delivery_rate,
                "status": get_status(delivery_rate),
                "label": "Delivery Rate"
            },
            "total_planned": {
                "value": total_planned,
                "label": "Total Planned"
            },
            "total_aired": {
                "value": total_aired,
                "label": "Total Aired"
            },
            "matched": {
                "value": matched_count,
                "label": "Matched Spots"
            },
            "over_delivered": {
                "value": over_delivered,
                "status": "info" if over_delivered > 0 else "good",
                "label": "Over-Delivered"
            },
            "under_delivered": {
                "value": under_delivered,
                "status": "critical" if under_delivered > 5 else ("warning" if under_delivered > 0 else "good"),
                "label": "Under-Delivered"
            },
            "program_accuracy": {
                "value": program_accuracy,
                "status": get_status(program_accuracy),
                "label": "Program Accuracy"
            },
            "duration_accuracy": {
                "value": duration_accuracy,
                "status": get_status(duration_accuracy),
                "label": "Duration Accuracy"
            }
        }
        
        return json.dumps({
            "success": True,
            "metrics": metrics
        }, indent=2)
        
    except Exception as e:
        return json.dumps({"error": str(e)})
