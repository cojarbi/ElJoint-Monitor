"""
Media Monitor Agent - Google ADK Implementation
Analyzes media execution logs against planned media buys
"""
import os
from google.adk import Agent
from google.adk.tools import FunctionTool

from tools import (
    parse_plan_file_tool,
    parse_execution_file_tool,
    match_spots_tool,
    calculate_metrics_tool,
    generate_report_tool
)


AGENT_INSTRUCTIONS = """
You are a media monitoring specialist analyzing advertising campaign execution.

## Your Role
Analyze uploaded Plan and Execution Excel files to verify that media companies 
delivered exactly what was purchased.

## Analysis Workflow
1. **Parse Plan File**: Use parse_plan_file_tool to extract planned spots from 
   the Presupuesto Excel file (MEDCOM and TVN tabs)

2. **Parse Execution File**: Use parse_execution_file_tool to extract aired spots 
   from the Monitoreo Excel file (Consulta Infoanalisis tab)

3. **Match Spots**: Use match_spots_tool to intelligently match planned spots 
   with aired spots using fuzzy matching

4. **Calculate Metrics**: Use calculate_metrics_tool to compute accuracy scores:
   - Delivery rate (planned vs actually delivered)
   - Over-delivery (spots aired without a plan)
   - Under-delivery (planned spots that didn't air)
   - Program accuracy
   - Duration accuracy

5. **Generate Report**: Use generate_report_tool to create the final structured 
   report with your AI insights

## Matching Rules
- **Channel**: Exact match required (Telemetro, TVN)
- **Duration**: ±2 seconds tolerance (accounts for monitoring precision)
- **Program**: Fuzzy match with 80% similarity threshold (handles typos, abbreviations)
- **Date**: Must match planned day-of-week pattern (L-V = Monday-Friday)

## Analysis Focus (IMPORTANT)
Include in analysis:
- Program matching accuracy
- Duration verification
- Channel verification
- Delivery rate calculations

Exclude from analysis (per user requirements):
- Financial/monetary data (Tarifa neta, Total_Inversion)
- "Datos de Consulta" tab (metadata only)
- "Resumen" tab (financial summary)

## Output Format
After running all tools, provide:
1. **Executive Summary**: 2-3 sentences about overall campaign performance
2. **Key Findings**: Bullet points of important discoveries
3. **Discrepancy Analysis**: Explain the main issues found
4. **Recommendations**: Actionable next steps

Be concise but thorough. Use business language that media buyers will understand.
"""


def create_media_monitor_agent() -> Agent:
    """
    Create and configure the Media Monitor Agent with all custom tools.
    
    Returns:
        Configured Agent instance
    """
    # Create tool instances
    parse_plan_tool = FunctionTool(
        func=parse_plan_file_tool,
        name="parse_plan_file",
        description="Parse the Plan (Presupuesto) Excel file to extract planned advertising spots. Returns planned spots grouped by channel (MEDCOM/Telemetro and TVN)."
    )
    
    parse_execution_tool = FunctionTool(
        func=parse_execution_file_tool,
        name="parse_execution_file",
        description="Parse the Execution (Monitoreo) Excel file to extract actually aired spots from the Consulta Infoanalisis tab. Returns list of aired spots with channel, program, date, and duration."
    )
    
    match_tool = FunctionTool(
        func=match_spots_tool,
        name="match_spots",
        description="Match planned spots with aired spots using intelligent fuzzy matching. Handles channel matching, duration tolerance (±2 seconds), and program name similarity. Returns matched pairs and discrepancies."
    )
    
    metrics_tool = FunctionTool(
        func=calculate_metrics_tool,
        name="calculate_metrics",
        description="Calculate accuracy metrics from match results including delivery rate, over/under delivery counts, program accuracy, and duration accuracy. Returns metrics with status indicators."
    )
    
    report_tool = FunctionTool(
        func=generate_report_tool,
        name="generate_report",
        description="Generate a comprehensive analysis report combining metrics, discrepancies, and AI insights into a structured format with recommendations."
    )
    
    # Create the agent
    agent = Agent(
        name="MediaMonitorAgent",
        model="gemini-3.0-flash",
        instructions=AGENT_INSTRUCTIONS,
        tools=[
            parse_plan_tool,
            parse_execution_tool,
            match_tool,
            metrics_tool,
            report_tool
        ]
    )
    
    return agent


def run_analysis(plan_file_path: str, execution_file_path: str) -> dict:
    """
    Run the complete media monitoring analysis.
    
    Args:
        plan_file_path: Path to the Plan (Presupuesto) Excel file
        execution_file_path: Path to the Execution (Monitoreo) Excel file
        
    Returns:
        Analysis results dictionary
    """
    agent = create_media_monitor_agent()
    
    prompt = f"""
    Analyze these media files:
    - Plan file: {plan_file_path}
    - Execution file: {execution_file_path}
    
    Follow the analysis workflow:
    1. Parse both files
    2. Match spots
    3. Calculate metrics
    4. Generate report with your insights
    
    Provide a comprehensive analysis.
    """
    
    response = agent.run(prompt)
    
    return {
        "status": "success",
        "analysis": response.content,
        "tool_calls": [call.to_dict() for call in response.tool_calls] if hasattr(response, 'tool_calls') else []
    }


if __name__ == "__main__":
    # Test the agent creation
    agent = create_media_monitor_agent()
    print(f"Agent created: {agent.name}")
    print(f"Tools: {[t.name for t in agent.tools]}")
