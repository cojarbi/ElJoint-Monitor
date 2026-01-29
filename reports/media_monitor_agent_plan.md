# Media Monitor Agent - Planning Document (Google ADK)

**Created:** 2026-01-29  
**Updated:** 2026-01-29 (Google ADK Integration)  
**Location:** `/agents/monitor`  
**Technology:** Google Agent Development Kit (Python) + Next.js  
**Purpose:** AI-powered verification of media buy execution vs. planned orders

---

## Executive Summary

This document outlines the plan to build an **intelligent AI agent** using **Google's Agent Development Kit (ADK)** that analyzes media execution logs against planned media buys. The agent leverages **Gemini's natural language capabilities** to provide human-readable insights and intelligent matching beyond simple rule-based logic.

The system compares two Excel files:
- **Plan File** (Presupuesto): What was ordered and paid for
- **Execution File** (Monitoreo): What actually aired according to Kantar Ibope Media

**Key Innovation:** Unlike traditional rule-based systems, this ADK agent uses **LLM-powered reasoning** to:
- Intelligently match spots with variations in program names
- Provide natural language explanations for discrepancies
- Generate actionable recommendations based on business context
- Adapt to edge cases without explicit programming

---

## Architecture Overview

### Hybrid Python + TypeScript Stack

```
┌─────────────────────────────────────────────────────────┐
│                Next.js Frontend (TypeScript)            │
│  • File upload interface                                │
│  • Results visualization                                │
│  • AI insights display                                  │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP API
┌─────────────────────────────────────────────────────────┐
│            Python ADK Service (Port 8000)               │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Google ADK LlmAgent + Gemini 2.0 Flash          │ │
│  │  • Natural language analysis                      │ │
│  │  • Tool orchestration                             │ │
│  │  • Context-aware reasoning                        │ │
│  └───────────────────────────────────────────────────┘ │
│                          ↓                              │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Custom Tools (Python)                            │ │
│  │  • parse_plan_file - Excel extraction            │ │
│  │  • parse_execution_file - Data parsing           │ │
│  │  • match_spots - Fuzzy matching                  │ │
│  │  • calculate_metrics - Accuracy scores           │ │
│  │  • generate_report - Structured output           │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Why This Architecture?**
- **Google ADK is Python-based** - Requires Python runtime
- **Existing app is Next.js** - Keep UI in TypeScript
- **Microservices pattern** - Python service handles AI logic, Next.js handles UI
- **Scalable** - Services can be deployed independently

---

## Google ADK Agent Design

### Agent Type: LlmAgent

**Rationale:** We need **natural language reasoning** to:
- Understand variations in program names ("Telediario" vs "Tele Diario")
- Explain why spots didn't match
- Provide business context ("over-delivery may indicate bonus spots")
- Generate actionable recommendations

**Agent Configuration:**
```python
from google.adk import LlmAgent

agent = LlmAgent(
    name="MediaMonitorAgent",
    model="gemini-2.0-flash",
    instructions="""
    You are a media monitoring specialist analyzing advertising campaigns.
    
    Your responsibilities:
    1. Parse Plan and Execution Excel files
    2. Match planned spots with aired spots using intelligent fuzzy logic
    3. Identify discrepancies (missing, extra, wrong placement)
    4. Calculate accuracy metrics
    5. Provide natural language insights and recommendations
    
    Matching rules:
    - Channel: Exact match required
    - Duration: ±2 seconds tolerance
    - Program: Fuzzy match (handle typos, abbreviations, spacing)
    - Date: Must match planned day-of-week pattern
    
    Always explain your reasoning clearly and provide actionable insights.
    """,
    tools=[
        parse_plan_file_tool,
        parse_execution_file_tool,
        match_spots_tool,
        calculate_metrics_tool,
        generate_report_tool
    ]
)
```

---

## Custom Tools

### 1. parse_plan_file

**Purpose:** Extract planned spots from Presupuesto Excel file

**Input:** File path to .xls file  
**Output:** List of PlannedSpot objects

**Logic:**
- Read MEDCOM and TVN tabs
- Extract: Programa, Días, Horario, Duración
- Normalize channel names
- Expand day patterns (L-V → Monday-Friday dates)

**Example Output:**
```python
[
    PlannedSpot(
        channel="Telemetro",
        program="Telediario",
        days="L-V",
        time_slot="06:00-07:00",
        duration=35,
        count=5
    ),
    ...
]
```

---

### 2. parse_execution_file

**Purpose:** Extract aired spots from Monitoreo Excel file

**Input:** File path to .xls file  
**Output:** List of AiredSpot objects

**Logic:**
- Read Consulta Infoanalisis tab
- Extract: Vehiculo, Soporte, FECHA, Duración_Real
- Parse date (YYYYMMDD → datetime)
- Normalize channel names

**Example Output:**
```python
[
    AiredSpot(
        channel="Telemetro",
        program="Telediario",
        date=datetime(2025, 5, 1),
        duration=35
    ),
    ...
]
```

---

### 3. match_spots

**Purpose:** Intelligently match aired spots with planned spots

**Input:** 
- List of PlannedSpot
- List of AiredSpot

**Output:** MatchResult with matches and discrepancies

**Matching Algorithm:**
```
For each aired spot:
  1. Filter candidates by channel (exact match)
  2. Filter by duration (±2 seconds)
  3. Fuzzy match on program name (Levenshtein distance)
  4. Select best match (similarity ≥ 80%)
  5. Verify date matches day-of-week pattern
  6. If match found → add to matches
  7. If no match → categorize discrepancy
```

**Fuzzy Matching Examples:**
- "Telediario" ↔ "Tele Diario" → 95% match ✅
- "Telediario" ↔ "Telediario Matutino" → 75% match ❌
- "TVN Noticias" ↔ "TVN NOTICIAS" → 100% match ✅

---

### 4. calculate_metrics

**Purpose:** Compute accuracy metrics

**Input:** MatchResult  
**Output:** Metrics dictionary

**Calculations:**
```python
{
    "delivery_rate": (matched / total_planned) × 100,
    "total_planned": count of planned spots,
    "total_aired": count of aired spots,
    "matched": count of successful matches,
    "over_delivered": aired spots without plan,
    "under_delivered": planned spots not aired,
    "program_accuracy": spots in correct program / total,
    "duration_accuracy": spots with correct duration / total,
    "channel_accuracy": spots on correct channel / total
}
```

---

### 5. generate_report

**Purpose:** Structure final analysis output

**Input:** Metrics + Discrepancies  
**Output:** JSON report

**Structure:**
```json
{
  "summary": {
    "delivery_rate": 96.4,
    "total_planned": 250,
    "total_aired": 854,
    "matched": 241
  },
  "ai_insights": "The campaign achieved 96.4% delivery rate...",
  "discrepancies": [
    {
      "type": "missing_spot",
      "channel": "TVN",
      "program": "Telediario",
      "severity": "high",
      "explanation": "Planned spot on Monday 6am did not air"
    }
  ],
  "recommendations": [
    "Follow up with TVN regarding 9 missing spots",
    "Investigate 604 over-delivered spots for billing accuracy"
  ]
}
```

---

## AI-Powered Features

### Natural Language Insights

**Traditional System:**
> "Delivery rate: 96.4%. 9 spots missing. 604 extra spots."

**ADK Agent with Gemini:**
> "The campaign achieved a strong 96.4% delivery rate, with 241 out of 250 planned spots successfully aired. However, there are two notable findings:
> 
> 1. **Under-delivery (9 spots):** Nine planned spots on TVN did not air, primarily during the 6-7am time slot on weekdays. This represents a 3.6% shortfall that should be addressed with the media company.
> 
> 2. **Significant over-delivery (604 spots):** The monitoring data shows 604 additional spots beyond what was planned. This could indicate:
>    - Bonus spots provided by the media company
>    - Spots from a different campaign incorrectly attributed
>    - Extended campaign period not reflected in the plan
> 
> **Recommendation:** Verify with the media company whether the 604 extra spots were intentional bonus placements or a data attribution error."

---

### Intelligent Matching Examples

**Scenario 1: Typo in Program Name**
- Planned: "Telediario"
- Aired: "Tele Diario" (with space)
- **Traditional system:** No match ❌
- **ADK Agent:** Fuzzy match detected (95% similarity) ✅
- **Insight:** "Matched despite spacing variation in program name"

**Scenario 2: Abbreviated Program Name**
- Planned: "Telemetro Reporta"
- Aired: "T. Reporta"
- **Traditional system:** No match ❌
- **ADK Agent:** Context-aware match (understands abbreviation) ✅
- **Insight:** "Matched abbreviated program name using context"

**Scenario 3: Duration Variation**
- Planned: 35 seconds
- Aired: 33 seconds
- **Traditional system:** Depends on tolerance setting
- **ADK Agent:** Match with explanation ✅
- **Insight:** "Duration within acceptable 2-second tolerance (likely due to monitoring precision)"

---

## Data Sources

### Plan File: "Presupuesto El Fuerte Dia de la Madre 2025.xls"

**Relevant Tabs:**
- MEDCOM (Telemetro schedule)
- TVN (TVN-2 schedule)

**Key Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Programa | TV show name | "Telediario" |
| Días | Broadcast days | "L-V" (Mon-Fri) |
| Horario | Time slot | "06:00-07:00" |
| Duración | Spot duration | 35 seconds |

**Excluded:** Resumen tab (financial data)

---

### Execution File: "monitoreo del fuerte.xls"

**Relevant Tabs:**
- Consulta Infoanalisis (854 aired spots)

**Key Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Vehiculo | Channel | "TVN", "Telemetro" |
| Soporte | Program | "Telediario" |
| FECHA | Air date | 20250501 (YYYYMMDD) |
| Duración_Real | Actual duration | 35 seconds |

**Excluded:** Datos de Consulta tab (metadata)

---

## User Interface

### Page: `/agents/monitor`

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Media Monitor Agent                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────────────┐  ┌────────────────────┐       │
│  │ 📄 Plan File       │  │ 📊 Execution File  │       │
│  │ Drop or click      │  │ Drop or click      │       │
│  │ [Presupuesto.xls]  │  │ [monitoreo.xls]    │       │
│  └────────────────────┘  └────────────────────┘       │
│                                                         │
│              [Analyze Media Execution]                  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Results (Tabs)                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ [AI Insights] [Summary] [Matched] [Discrepancies]│   │
│  ├─────────────────────────────────────────────────┤   │
│  │                                                 │   │
│  │  🤖 AI Insights:                                │   │
│  │  The campaign achieved a strong 96.4% delivery  │   │
│  │  rate with 241 out of 250 planned spots...     │   │
│  │                                                 │   │
│  │  Key Findings:                                  │   │
│  │  • 9 spots under-delivered on TVN               │   │
│  │  • 604 over-delivered spots (investigate)       │   │
│  │                                                 │   │
│  │  Recommendations:                               │   │
│  │  1. Follow up with TVN for missing spots        │   │
│  │  2. Verify over-delivery with media company     │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key Addition:** **AI Insights Tab** showing Gemini's natural language analysis (not available in traditional systems)

---

## Implementation Phases

### Phase 1: Python ADK Service (6-8 hours)

**Tasks:**
1. Set up Python project structure
2. Install Google ADK and dependencies
3. Create 5 custom tools (Excel parsing, matching, metrics)
4. Build LlmAgent with Gemini integration
5. Create FastAPI server with /analyze endpoint
6. Test with sample Excel files

**Deliverables:**
- `agents/media_monitor_agent.py`
- `agents/tools/` directory with 5 tool files
- `agents/api_server.py`
- `agents/requirements.txt`
- `agents/Dockerfile`

---

### Phase 2: Next.js Integration (3-4 hours)

**Tasks:**
1. Create `/agents/monitor` page
2. Build FileUploadZone component
3. Create API proxy route
4. Implement AnalysisResults component
5. Add AI Insights display section

**Deliverables:**
- `app/(dashboard)/agents/monitor/page.tsx`
- `app/api/agents/monitor/analyze/route.ts`
- `components/media-monitor/` directory with 4 components

---

### Phase 3: Testing & Refinement (3-4 hours)

**Tasks:**
1. Test with actual campaign files
2. Refine agent instructions based on results
3. Adjust matching tolerance if needed
4. Add error handling
5. Optimize performance

**Deliverables:**
- `agents/tests/test_agent.py`
- Updated agent instructions
- Performance benchmarks

---

### Phase 4: Deployment (2 hours)

**Tasks:**
1. Configure Docker Compose
2. Set up environment variables
3. Deploy to development environment
4. Create user documentation

**Deliverables:**
- Updated `docker-compose.yml`
- `.env.example` file
- User guide

**Total Estimated Time:** 14-18 hours

---

## Success Criteria

✅ **Functional:**
- [ ] Agent successfully parses both Excel files
- [ ] Matching achieves >90% accuracy on test data
- [ ] AI insights are accurate and actionable
- [ ] All 6 metric categories display correctly
- [ ] Discrepancies are correctly categorized

✅ **Performance:**
- [ ] Analysis completes in <15 seconds
- [ ] Handles files up to 10,000 rows
- [ ] No memory leaks or crashes

✅ **Quality:**
- [ ] Natural language insights are clear and helpful
- [ ] Recommendations are specific and actionable
- [ ] UI is intuitive and responsive

---

## Advantages Over Traditional Approach

| Feature | Traditional System | Google ADK Agent |
|---------|-------------------|------------------|
| **Program Matching** | Exact string match only | Fuzzy + context-aware |
| **Insights** | Raw metrics only | Natural language explanations |
| **Adaptability** | Requires code changes | Adjust via instructions |
| **Error Handling** | Generic error messages | Contextual explanations |
| **Recommendations** | None | AI-generated suggestions |
| **Edge Cases** | Must be explicitly coded | LLM handles intelligently |

---

## Dependencies

### Python (New)
```bash
pip install google-adk openpyxl pandas fastapi uvicorn python-multipart python-Levenshtein
```

### Node.js (Existing)
- Next.js, React, shadcn/ui, TanStack Table ✅ Already installed

### Environment
- **Google API Key** (Gemini) - Required
- Python 3.9+
- Node.js 16+

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google API costs | Medium | Use Gemini Flash (cheapest), cache results |
| Python service downtime | High | Health checks, auto-restart, fallback to basic matching |
| LLM hallucinations | Medium | Validate all tool outputs, use structured output format |
| Slow LLM inference | Medium | Use streaming responses, show progress indicator |
| Program name variations | High | Extensive fuzzy matching, LLM context understanding |

---

## Future Enhancements

**Phase 2 (Post-MVP):**
1. **Multi-Agent System** - Separate agents for parsing, matching, reporting
2. **Interactive Chat** - Ask questions: "Why didn't spot X match?"
3. **Historical Tracking** - Save analyses to database, track trends
4. **Automated Alerts** - Email notifications for low delivery rates
5. **Batch Processing** - Analyze multiple campaigns simultaneously
6. **Custom Rules** - User-defined matching tolerances and business rules

---

## Conclusion

This Google ADK-powered agent represents a **significant advancement** over traditional rule-based systems by providing:

🤖 **Intelligent Analysis** - LLM-powered reasoning beyond simple rules  
💬 **Natural Language Insights** - Human-readable explanations  
🎯 **Actionable Recommendations** - Business-context-aware suggestions  
🔧 **Adaptability** - Easy to refine via natural language instructions  
📊 **Comprehensive Metrics** - Quantitative + qualitative analysis  

The hybrid Python + Next.js architecture allows us to leverage cutting-edge AI capabilities while maintaining a familiar, responsive UI.

**Next Steps:**
1. Review and approve this plan
2. Obtain Google API key
3. Begin Phase 1: Python ADK service development
4. Test with actual campaign files
5. Iterate based on results

---

**For detailed technical implementation, see:** [implementation_plan.md](file:///Users/ayahni/.gemini/antigravity/brain/e999f281-e796-4fed-b358-8dacc63d5645/implementation_plan.md)
