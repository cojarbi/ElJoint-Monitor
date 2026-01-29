"""
Type definitions for Media Monitor Agent
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from enum import Enum


class DiscrepancyType(Enum):
    MISSING_SPOT = "missing_spot"
    EXTRA_SPOT = "extra_spot"
    WRONG_PROGRAM = "wrong_program"
    WRONG_DURATION = "wrong_duration"
    WRONG_CHANNEL = "wrong_channel"
    WRONG_DATE = "wrong_date"
    WRONG_TIME = "wrong_time"


class Severity(Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class PlannedSpot:
    """Represents a planned advertising spot from the Plan file"""
    channel: str
    program: str
    days: str  # "L-V", "D-M", etc.
    time_slot: str
    duration: int  # seconds
    count: int = 1
    
    def to_dict(self) -> dict:
        return {
            "channel": self.channel,
            "program": self.program,
            "days": self.days,
            "time_slot": self.time_slot,
            "duration": self.duration,
            "count": self.count
        }


@dataclass
class AiredSpot:
    """Represents an actually aired spot from the Execution file"""
    channel: str
    program: str
    date: datetime
    duration: int  # seconds
    
    def to_dict(self) -> dict:
        return {
            "channel": self.channel,
            "program": self.program,
            "date": self.date.isoformat() if self.date else None,
            "duration": self.duration
        }


@dataclass
class MatchedSpot:
    """Represents a successfully matched spot"""
    planned: PlannedSpot
    aired: AiredSpot
    match_score: float  # 0-1 similarity score
    
    def to_dict(self) -> dict:
        return {
            "planned": self.planned.to_dict(),
            "aired": self.aired.to_dict(),
            "match_score": self.match_score
        }


@dataclass
class Discrepancy:
    """Represents a discrepancy between plan and execution"""
    type: DiscrepancyType
    severity: Severity
    channel: str
    program: str
    expected: Optional[str]
    actual: Optional[str]
    explanation: str
    
    def to_dict(self) -> dict:
        return {
            "type": self.type.value,
            "severity": self.severity.value,
            "channel": self.channel,
            "program": self.program,
            "expected": self.expected,
            "actual": self.actual,
            "explanation": self.explanation
        }


@dataclass
class MatchResult:
    """Result of the spot matching process"""
    matched: list[MatchedSpot]
    discrepancies: list[Discrepancy]
    unmatched_planned: list[PlannedSpot]
    unmatched_aired: list[AiredSpot]
    
    def to_dict(self) -> dict:
        return {
            "matched": [m.to_dict() for m in self.matched],
            "discrepancies": [d.to_dict() for d in self.discrepancies],
            "unmatched_planned": [p.to_dict() for p in self.unmatched_planned],
            "unmatched_aired": [a.to_dict() for a in self.unmatched_aired]
        }


@dataclass
class Metrics:
    """Analysis metrics"""
    delivery_rate: float
    total_planned: int
    total_aired: int
    matched: int
    over_delivered: int
    under_delivered: int
    program_accuracy: float
    duration_accuracy: float
    channel_accuracy: float
    
    def to_dict(self) -> dict:
        return {
            "delivery_rate": self.delivery_rate,
            "total_planned": self.total_planned,
            "total_aired": self.total_aired,
            "matched": self.matched,
            "over_delivered": self.over_delivered,
            "under_delivered": self.under_delivered,
            "program_accuracy": self.program_accuracy,
            "duration_accuracy": self.duration_accuracy,
            "channel_accuracy": self.channel_accuracy
        }


@dataclass
class AnalysisResult:
    """Complete analysis result"""
    metrics: Metrics
    match_result: MatchResult
    ai_insights: str
    recommendations: list[str]
    
    def to_dict(self) -> dict:
        return {
            "metrics": self.metrics.to_dict(),
            "match_result": self.match_result.to_dict(),
            "ai_insights": self.ai_insights,
            "recommendations": self.recommendations
        }
