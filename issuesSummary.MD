1. HIGHEST CERTAINTY - Missing Budget Data for October-November Period
Lines 525-971 show extensive "missing" records for October 1 - December 14, 2025. These represent 446 budget line items with 0 insertions found.

Why: The budget has scheduled spots for these date ranges but the insertion log doesn't contain any corresponding executions. This could mean:

The insertion log file doesn't cover this time period
Ads were never actually run during this period
The insertion data hasn't been uploaded yet
2. HIGH CERTAINTY - Non-Standard Duration Mismatches
Lines 1107-1222 show "No Matching Budget" errors, many with unusual durations (7, 8, 9, 140, 160, 175, 180, 190, 195, 250, 280 seconds).

Why: The budget likely only specifies standard durations (10 and 35 seconds), but the insertion log contains many non-standard spot lengths. The matching logic probably requires exact duration matches, causing these to be unmatched.

3. HIGH CERTAINTY - Program Name Mapping Issues
The "No Matching Budget" section shows insertions for programs like:

TU MANANA (only 7-8 sec durations - possibly promotional spots)
JELOU (various non-standard durations)
JELOU-R (appears to be reruns in MADRUGADA time slot - not in budget)
LA ROSA DE GUADALUPE, GORDITO DEL ZODIACO (specific programs not budgeted)
Why: Either these programs weren't in the original budget or they have slightly different names between budget and insertion log.

4. MEDIUM-HIGH CERTAINTY - Over-Delivery ("Exceeded Order Qty")
Lines 979-1106 show 200+ instances where more spots were inserted than ordered.

Why: Based on recent allocation logic changes (from conversation history), the system uses a "resource consumption" model. If this logic has bugs or if insertions were distributed across wrong budget lines, you'd see:

Legitimate budget lines getting depleted too quickly
Overflow happening even when total capacity exists
5 MEDIUM CERTAINTY - Under-Delivery
Lines 972-977 show 6 instances of under-delivery (budget ordered more than was inserted).

Why: Likely legitimate - stations simply didn't air all purchased spots for those specific date/program/duration combinations.

6. MEDIUM CERTAINTY - Franja (Time Segment) Mapping
Some "No Matching Budget" entries show time ranges that don't match standard Franjas (e.g., JELOU-R in MADRUDAGA with N/A time range).

Why: The Franja mapping logic may not handle edge cases like reruns, special programming, or overnight slots correctly.

Root Cause Priority Order:
Date Range Gap - Missing October-November data accounts for the largest volume of discrepancies
Duration Standardization - Non-standard spot lengths (especially 7-8 sec spots) aren't matching
Program Name Standardization - Promotional content, reruns, and special programs have different naming
Allocation Algorithm - The resource consumption logic may be incorrectly distributing insertions
Budget Granularity - Budget may be too high-level (missing specific sub-programs or special segments)
Recommended Next Steps:

Verify the insertion log covers October-November period
Check if 7-8 second spots are promotional/station IDs that shouldn't be reconciled
Review the allocation logic for bugs in the quantity distribution
Add alias mappings for program name variations 5.Consider whether non-standard durations should match "closest duration" rather than exact match