'use client';

import { useState, useEffect, useMemo } from 'react';
import { NormalizedRow } from '@/components/budget/BudgetUploader';
import { InsertionLogRow } from '@/components/insertion-log/InsertionLogUploader';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FileText, Play, Download, Search, CheckCircle2, AlertCircle, XCircle, ArrowUpDown } from 'lucide-react';
import { useAiModel } from '@/hooks/use-ai-settings';
import { useAliasMappings } from '@/hooks/use-alias-mappings';
import { utils, writeFile } from 'xlsx';
import { MonthFilter, DayFilter, MedioFilter } from '@/components/summary/DateFilter';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

interface ReconciledRow extends NormalizedRow {
    franja: string;
    originalTitle: string;
    totalInserted: number;
    difference: number;
    reconciliationConfidence: number;
    status: 'matched' | 'under' | 'over' | 'missing';
}

interface OverflowRow {
    date: string;
    medio: string;
    originalTitle: string;
    franja: string;
    timeRange: string;
    duration: number;
    insertions: number;
    reason: 'Exceeded Order Qty' | 'No Matching Budget' | 'Parse Error (Budget)' | 'Parse Error (Insertion)' | 'Duration Mismatch' | 'Outside Schedule' | 'Budget Full' | 'No Budget for Medio' | 'No Budget for Date';
}

interface NonStandardRow extends InsertionLogRow {
    reason: 'Non-Standard Duration';
}

interface StoredBudgetData {
    data: NormalizedRow[];
    fileName?: string;
    fileNames?: string;
}

interface StoredInsertionData {
    data: InsertionLogRow[];
    fileName?: string;
}

// Interface for persisting the summary state
interface StoredSummaryState {
    reconciledData: ReconciledRow[];
    overflowData: OverflowRow[];
    budgetFileName?: string;
    insertionFileName?: string;
    nonStandardData?: NonStandardRow[];
}

type SortField = 'date' | 'medio' | 'program' | 'schedule' | 'originalTitle' | 'durationSeconds' | 'orderedQuantity' | 'totalInserted' | 'reconciliationConfidence';
type OverflowSortField = 'date' | 'medio' | 'originalTitle' | 'franja' | 'timeRange' | 'duration' | 'insertions' | 'reason';
type NonStandardSortField = 'date' | 'medio' | 'originalTitle' | 'franja' | 'timeRange' | 'duration' | 'insertions' | 'reason';
type SortDirection = 'asc' | 'desc';

export default function SummaryPage() {
    const { model } = useAiModel();
    const { getMappingObject } = useAliasMappings();
    const [budgetData, setBudgetData] = useState<StoredBudgetData | null>(null);
    const [insertionData, setInsertionData] = useState<StoredInsertionData | null>(null);
    const [reconciledData, setReconciledData] = useState<ReconciledRow[] | null>(null);
    const [overflowData, setOverflowData] = useState<OverflowRow[]>([]);
    const [nonStandardData, setNonStandardData] = useState<NonStandardRow[]>([]);
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [selectedDays, setSelectedDays] = useState<number[]>([]);
    const [selectedMedios, setSelectedMedios] = useState<string[]>([]);

    // Load filters from localStorage on mount
    useEffect(() => {
        const savedMonths = localStorage.getItem('summary_date_filter');
        if (savedMonths) {
            setSelectedMonths(JSON.parse(savedMonths));
        }
        const savedDays = localStorage.getItem('summary_day_filter');
        if (savedDays) {
            try {
                // Handle legacy single value or new array
                const parsed = JSON.parse(savedDays);
                if (Array.isArray(parsed)) setSelectedDays(parsed);
                else setSelectedDays([Number(parsed)]);
            } catch (e) {
                // If it's a raw number string
                setSelectedDays([Number(savedDays)]);
            }
        }
        const savedMedios = localStorage.getItem('summary_medio_filter');
        if (savedMedios) {
            try {
                const parsed = JSON.parse(savedMedios);
                if (Array.isArray(parsed)) setSelectedMedios(parsed);
            } catch (e) {
                console.error("Failed to parse saved medios", e);
            }
        }
    }, []);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [overflowSortField, setOverflowSortField] = useState<OverflowSortField>('date');
    const [overflowSortDirection, setOverflowSortDirection] = useState<SortDirection>('asc');
    const [nonStandardSortField, setNonStandardSortField] = useState<NonStandardSortField>('date');
    const [nonStandardSortDirection, setNonStandardSortDirection] = useState<SortDirection>('asc');
    const [accordionValue, setAccordionValue] = useState<string>("");

    useEffect(() => {
        const saved = localStorage.getItem('summary_accordion_state');
        if (saved) setAccordionValue(saved);
    }, []);

    const handleAccordionChange = (val: string) => {
        setAccordionValue(val);
        if (val) localStorage.setItem('summary_accordion_state', val);
        else localStorage.removeItem('summary_accordion_state');
    };

    useEffect(() => {
        // Load source data from localStorage
        try {
            const budgetStored = localStorage.getItem('budget_data');
            const insertionStored = localStorage.getItem('insertion_log_data');
            const summaryStored = localStorage.getItem('summary_reconciliation_data');

            let parsedBudget: StoredBudgetData | null = null;
            let parsedInsertion: StoredInsertionData | null = null;

            if (budgetStored) {
                parsedBudget = JSON.parse(budgetStored);
                setBudgetData(parsedBudget);
            }
            if (insertionStored) {
                parsedInsertion = JSON.parse(insertionStored);
                setInsertionData(parsedInsertion);
            }

            // Load persisted summary if it matches the current files
            if (summaryStored && parsedBudget && parsedInsertion) {
                const parsedSummary: StoredSummaryState = JSON.parse(summaryStored);

                // Check if files match
                const budgetMatch = parsedSummary.budgetFileName === parsedBudget.fileName;
                const insertionMatch = parsedSummary.insertionFileName === parsedInsertion.fileName;

                if (budgetMatch && insertionMatch) {
                    setReconciledData(parsedSummary.reconciledData);
                    setOverflowData(parsedSummary.overflowData || []);
                    setNonStandardData(parsedSummary.nonStandardData || []);
                } else {
                    localStorage.removeItem('summary_reconciliation_data');
                }
            }

            // Load persisted filter
            const savedFilter = localStorage.getItem('summary_date_filter');
            if (savedFilter) {
                setSelectedMonths(JSON.parse(savedFilter));
            }
        } catch (e) {
            console.error('Failed to load data from localStorage', e);
        }
    }, []);

    const [statusMessage, setStatusMessage] = useState('Processing...');

    // Helper to parse "HH:MM - HH:MM" or "HH:MM-HH:MM"
    // Returns { start: minutes, end: minutes } or null
    const parseTimeRange = (timeStr: string | undefined): { start: number, end: number } | null => {
        if (!timeStr) return null;
        const normalized = timeStr.toLowerCase().replace(/\s+/g, '');
        // Matches "6:00am-8:00am", "18:00-20:00", "06:00-11:30"
        const match = normalized.match(/(\d{1,2}:\d{2})(?:[a-z]{2})?-(\d{1,2}:\d{2})(?:[a-z]{2})?/);
        if (!match) return null;

        const parseMinutes = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        return { start: parseMinutes(match[1]), end: parseMinutes(match[2]) };
    };

    // Check if Budget schedule fits INSIDE Insertion time range
    // Returns: 'match' | 'no_match' | 'parse_error_budget' | 'parse_error_insertion'
    const checkContainment = (budgetSched: string | undefined, insertionTime: string | undefined): 'match' | 'no_match' | 'parse_error_budget' | 'parse_error_insertion' => {
        const b = parseTimeRange(budgetSched);
        const i = parseTimeRange(insertionTime);

        if (!b) return 'parse_error_budget';
        if (!i) return 'parse_error_insertion';

        // Budget must be contained within Insertion: budgetStart >= insertionStart AND budgetEnd <= insertionEnd
        if (b.start >= i.start && b.end <= i.end) {
            return 'match';
        }
        return 'no_match';
    };


    const reconcileData = async () => {
        console.log('🔍 reconcileData called! budgetData:', budgetData, 'insertionData:', insertionData);
        if (!budgetData?.data || !insertionData?.data) {
            console.log('⚠️ Missing data! Returning early.');
            return;
        }

        console.log('✅ Data check passed. Starting reconciliation...');
        setIsLoading(true);
        setStatusMessage('Preparing data...');
        setReconciledData(null);
        setOverflowData([]);

        try {
            const budgetRows = budgetData.data;
            const insertionRows = insertionData.data;

            // 0. Filter Budget Rows by Selected Months
            // If no months selected, include all? Or assume none? Usually "no filter" means "all".
            // But here the user explicitly wants to "filter out".
            // Let's assume if selectedMonths is empty, show all (default behavior), 
            // BUT the user said "depending on what was selected".
            // If they select nothing, maybe we should show nothing? Or everything? 
            // Standard UI pattern: Empty selection = All, OR we force selection.
            // Let's assume Empty = All for now, unless the user wants to start with empty.
            // Actually, for "Reconciliation", usually you want to reconcile what you see.
            // If selectedMonths has values, filter.

            let filteredBudgetRows = budgetRows;
            if (selectedMonths.length > 0) {
                filteredBudgetRows = budgetRows.filter(row => {
                    // row.date format "YYYY-MM-DD"
                    // selectedMonths format "YYYY-MM"
                    const rowMonth = row.date.substring(0, 7);

                    if (!selectedMonths.includes(rowMonth)) return false;

                    if (selectedDays.length > 0) {
                        const dayPart = parseInt(row.date.split('-')[2], 10);
                        return selectedDays.includes(dayPart);
                    }

                    return true;
                });
            } else if (selectedDays.length > 0) {
                // Even if no months explicitly selected (meaning all), apply day filter if set
                filteredBudgetRows = budgetRows.filter(row => {
                    const dayPart = parseInt(row.date.split('-')[2], 10);
                    return selectedDays.includes(dayPart);
                });
            }

            if (selectedMedios.length > 0) {
                filteredBudgetRows = filteredBudgetRows.filter(row => selectedMedios.includes(row.medio));
            }

            let filteredInsertionRows = insertionRows;
            if (selectedMonths.length > 0) {
                filteredInsertionRows = insertionRows.filter(row => {
                    const rowMonth = row.date.substring(0, 7);
                    if (!selectedMonths.includes(rowMonth)) return false;
                    if (selectedDays.length > 0) {
                        const dayPart = parseInt(row.date.split('-')[2], 10);
                        return selectedDays.includes(dayPart);
                    }
                    return true;
                });
            } else if (selectedDays.length > 0) {
                filteredInsertionRows = insertionRows.filter(row => {
                    const dayPart = parseInt(row.date.split('-')[2], 10);
                    return selectedDays.includes(dayPart);
                });
            }

            // 1. Separate Standard vs Non-Standard Insertions (Using filtered rows)
            const standardInsertions: InsertionLogRow[] = [];
            let nonStandardInsertions: NonStandardRow[] = [];

            filteredInsertionRows.forEach(row => {
                const dur = Number(row.duration);
                // Strict check for 10 or 35
                if (dur === 10 || dur === 35) {
                    standardInsertions.push(row);
                } else {
                    nonStandardInsertions.push({ ...row, reason: 'Non-Standard Duration' });
                }
            });

            // 1. Prepare lists for AI (Only Medios now)
            // Use filtered budget rows for mapping context? Maybe safer to use all to ensure we capture all medio names
            // But for reconciliation we only care about filtered.
            // Let's use filteredBudgetRows for reconciliation.
            const budgetMedios = Array.from(new Set(filteredBudgetRows.map(r => r.medio).filter(Boolean)));
            const insertionMedios = Array.from(new Set(standardInsertions.map(r => r.medio).filter(Boolean)));

            // 2. Call AI API for Medio Mapping only
            let medioMap: Record<string, string | null> = {};
            setStatusMessage('Mapping Channels...');

            try {
                const response = await fetch('/api/reconcile-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        budgetMedios,
                        insertionMedios,
                        modelName: model,
                        medioAliases: getMappingObject('medios')
                    })
                });
                const result = await response.json();

                if (result.medioMapping) medioMap = result.medioMapping;
            } catch (error) {
                console.error("AI Reconciliation API failed, falling back to direct match", error);
            }

            // 3. Reconcile - New Logic with Resource Consumption
            setStatusMessage('Reconciling Matches...');

            // Track remaining capacity for each budget row
            const budgetCapacity: number[] = filteredBudgetRows.map(r => r.orderedQuantity);

            // Track remaining quantity for each insertion row
            const insertionRemaining: number[] = standardInsertions.map(r => r.insertions);

            // Track matching status for insertion rows
            // null = unchecked/no-match-attempted, string = specific error, 'matched' = matched at least one
            const insertionStatus: string[] = new Array(standardInsertions.length).fill(null);

            // Optimization: Index insertion rows by Date
            const insertionByDate: Record<string, { row: InsertionLogRow, idx: number }[]> = {};
            standardInsertions.forEach((row, idx) => {
                if (!insertionByDate[row.date]) insertionByDate[row.date] = [];
                insertionByDate[row.date].push({ row, idx });
            });

            const reconciled = filteredBudgetRows.map((budgetRow, budgetIdx) => {
                const candidateMatches = insertionByDate[budgetRow.date] || [];

                let totalInserted = 0;
                const matchedFranjas: string[] = [];
                const matchedTitles: string[] = [];
                let confidenceSum = 0;
                let matchCount = 0;

                for (const { row: log, idx: logIdx } of candidateMatches) {
                    if (insertionRemaining[logIdx] <= 0) continue;

                    // CRITERIA 2: MEDIO Check
                    const budgetMedioLower = budgetRow.medio?.toLowerCase();
                    const directMedioMatch = log.medio?.toLowerCase() === budgetMedioLower;
                    const mappedMedio = medioMap[log.medio];
                    const aiMedioMatch = mappedMedio && mappedMedio.toLowerCase() === budgetMedioLower;
                    const medioMatch = directMedioMatch || aiMedioMatch;

                    if (!medioMatch) continue;

                    // CRITERIA 3: DURATION Check
                    if (budgetRow.durationSeconds !== log.duration) continue;

                    // CRITERIA 4: TIME CONTAINMENT Check
                    const containmentResult = checkContainment(budgetRow.schedule, log.timeRange);

                    if (containmentResult !== 'match') {
                        // Only record the error if it hasn't been matched successfully elsewhere
                        // and we haven't already recorded a more specific error (optional)
                        if (insertionStatus[logIdx] !== 'matched') {
                            if (containmentResult === 'parse_error_budget') insertionStatus[logIdx] = 'Parse Error (Budget)';
                            else if (containmentResult === 'parse_error_insertion') insertionStatus[logIdx] = 'Parse Error (Insertion)';
                            // If 'no_match', we leave it null or set to 'No Matching Budget' at the end
                        }
                        continue;
                    }

                    // Successfully matched
                    insertionStatus[logIdx] = 'matched'; // Mark as having found a valid home

                    const needed = budgetCapacity[budgetIdx];
                    const available = insertionRemaining[logIdx];
                    const toAllocate = Math.min(available, needed);

                    if (toAllocate > 0) {
                        totalInserted += toAllocate;
                        budgetCapacity[budgetIdx] -= toAllocate;
                        insertionRemaining[logIdx] -= toAllocate;

                        if (log.franja) matchedFranjas.push(log.franja);
                        if (log.originalTitle) matchedTitles.push(log.originalTitle);
                        confidenceSum += (log.confidence || 0);
                        matchCount++;
                    }

                    // Note: We don't push to overflow here anymore. 
                    // We wait until we've checked ALL budget lines.
                }

                const avgConfidence = matchCount > 0 ? confidenceSum / matchCount : 0;
                const difference = budgetRow.orderedQuantity - totalInserted;

                let status: ReconciledRow['status'] = 'matched';
                if (totalInserted === 0) status = 'missing';
                else if (difference > 0) status = 'under';
                else if (difference < 0) status = 'over';

                return {
                    ...budgetRow,
                    franja: [...new Set(matchedFranjas)].join(', ') || '-',
                    originalTitle: [...new Set(matchedTitles)].join(', ') || '-',
                    totalInserted,
                    difference,
                    reconciliationConfidence: Math.round(avgConfidence),
                    status
                };
            });

            // 4. Calculate Overflow / Unmatched
            const overflow: OverflowRow[] = [];

            standardInsertions.forEach((log, idx) => {
                const remaining = insertionRemaining[idx];

                // If there are leftovers
                if (remaining > 0) {
                    let reason: OverflowRow['reason'] = 'No Matching Budget';

                    if (insertionStatus[idx] === 'matched') {
                        reason = 'Exceeded Order Qty';
                    } else if (insertionStatus[idx] && insertionStatus[idx] !== 'matched') {
                        // Use the recorded specific error
                        const status = insertionStatus[idx];
                        if (status.includes('Parse Error')) {
                            reason = status as any;
                        }
                    } else {
                        // It wasn't matched at all. Let's find out WHY.
                        // We check against ALL budget rows (filtered) to see what criteria failed.
                        // We iterate and try to find the "closest" failure.
                        // Order of specificity:
                        // 1. Date Found?
                        // 2. Medio Found? (Budget exists for this medio)
                        // 3. Duration Matched?
                        // 4. Time/Schedule Matched?
                        // 5. If all matched => Budget Full (Capacity issue) - but we covered "exceeded" above?
                        //    Actually "Budget Full" is if we matched but ran out of budget capacity BEFORE this row.

                        let bestReason: OverflowRow['reason'] = 'No Matching Budget';
                        let foundDate = false;
                        let foundMedio = false;
                        let foundDuration = false;
                        let foundTime = false;

                        for (const budgetRow of filteredBudgetRows) {
                            if (budgetRow.date === log.date) {
                                foundDate = true;

                                const budgetMedioLower = budgetRow.medio?.toLowerCase();
                                const directMedioMatch = log.medio?.toLowerCase() === budgetMedioLower;
                                const mappedMedio = medioMap[log.medio];
                                const aiMedioMatch = mappedMedio && mappedMedio.toLowerCase() === budgetMedioLower;

                                if (directMedioMatch || aiMedioMatch) {
                                    foundMedio = true;

                                    if (budgetRow.durationSeconds === log.duration) {
                                        foundDuration = true;

                                        const containment = checkContainment(budgetRow.schedule, log.timeRange);
                                        if (containment === 'match') {
                                            foundTime = true;
                                            // If we got here, it implies we COULD have matched, but maybe didn't?
                                            // Ideally if it matched fully, it should be in 'matched' or 'Exceeded Order Qty'.
                                            // But if we are in this block, 'insertionStatus[idx]' is null or not matched.
                                            // So this case might be rare if logic above is correct.
                                        }
                                    }
                                }
                            }
                        }

                        if (!foundDate) {
                            bestReason = 'No Budget for Date'; // Or keep generic
                        } else if (!foundMedio) {
                            bestReason = 'No Budget for Medio';
                        } else if (!foundDuration) {
                            bestReason = 'Duration Mismatch';
                        } else if (!foundTime) {
                            bestReason = 'Outside Schedule';
                        } else {
                            // If everything matched at least once but we still have remaining...
                            // It effectively means "No Budget Capacity" or "Budget Full"
                            bestReason = 'Budget Full';
                        }

                        reason = bestReason;
                    }

                    overflow.push({
                        date: log.date,
                        medio: log.medio,
                        originalTitle: log.originalTitle,
                        franja: log.franja,
                        timeRange: log.timeRange,
                        duration: log.duration,
                        insertions: remaining, // Only the remaining amount!
                        reason
                    });
                }
            });

            let finalOverflow = overflow;
            let finalNonStandard = nonStandardInsertions;

            // Apply Medio Filter to Overflow and Non-Standard
            if (selectedMedios.length > 0) {
                const isMedioMatch = (m: string) => {
                    if (!m) return false;
                    // Check exact match
                    if (selectedMedios.includes(m)) return true;
                    // Check mapped match
                    const mapped = medioMap[m];
                    if (mapped && selectedMedios.includes(mapped)) return true;
                    return false;
                };

                finalOverflow = overflow.filter(row => isMedioMatch(row.medio));
                finalNonStandard = nonStandardInsertions.filter(row => isMedioMatch(row.medio));
            }

            setReconciledData(reconciled);
            setOverflowData(finalOverflow);
            setNonStandardData(finalNonStandard);

            // Persist results
            const stateToSave: StoredSummaryState = {
                reconciledData: reconciled,
                overflowData: overflow,
                budgetFileName: budgetData.fileName,
                insertionFileName: insertionData.fileName,
                nonStandardData: nonStandardInsertions
            };
            localStorage.setItem('summary_reconciliation_data', JSON.stringify(stateToSave));

        } catch (e) {
            console.error('Reconciliation failed', e);
            alert(`Reconciliation Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle Month Selection Change
    const handleMonthChange = (months: string[]) => {
        setSelectedMonths(months);
        localStorage.setItem('summary_date_filter', JSON.stringify(months));
    };

    const handleDayChange = (days: number[]) => {
        setSelectedDays(days);
        if (days.length > 0) {
            localStorage.setItem('summary_day_filter', JSON.stringify(days));
        } else {
            localStorage.removeItem('summary_day_filter');
        }
    };

    const handleMedioChange = (medios: string[]) => {
        setSelectedMedios(medios);
        if (medios.length > 0) {
            localStorage.setItem('summary_medio_filter', JSON.stringify(medios));
        } else {
            localStorage.removeItem('summary_medio_filter');
        }
    };

    // Memoize available medios from budget data
    const availableMedios = useMemo(() => {
        if (!budgetData?.data) return [];
        const uniqueMedios = Array.from(new Set(budgetData.data.map(row => row.medio).filter(Boolean)));
        return uniqueMedios.sort();
    }, [budgetData]);



    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const handleOverflowSort = (field: OverflowSortField) => {
        if (overflowSortField === field) {
            setOverflowSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setOverflowSortField(field);
            setOverflowSortDirection('asc');
        }
    };

    const handleNonStandardSort = (field: NonStandardSortField) => {
        if (nonStandardSortField === field) {
            setNonStandardSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setNonStandardSortField(field);
            setNonStandardSortDirection('asc');
        }
    };

    const filteredAndSortedData = useMemo(() => {
        if (!reconciledData) return [];
        let data = [...reconciledData];

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            data = data.filter(row =>
                row.medio.toLowerCase().includes(term) ||
                row.program.toLowerCase().includes(term) ||
                row.originalTitle.toLowerCase().includes(term) ||
                row.date.includes(term)
            );
        }

        return data.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'date':
                    comparison = a.date.localeCompare(b.date);
                    break;
                case 'medio':
                    comparison = a.medio.localeCompare(b.medio);
                    break;
                case 'program':
                    comparison = a.program.localeCompare(b.program);
                    break;
                case 'schedule':
                    comparison = (a.schedule || '').localeCompare(b.schedule || '');
                    break;
                case 'originalTitle':
                    comparison = a.originalTitle.localeCompare(b.originalTitle);
                    break;
                case 'durationSeconds':
                    comparison = (a.durationSeconds || 0) - (b.durationSeconds || 0);
                    break;
                case 'orderedQuantity':
                    comparison = a.orderedQuantity - b.orderedQuantity;
                    break;
                case 'totalInserted':
                    comparison = a.totalInserted - b.totalInserted;
                    break;
                case 'reconciliationConfidence':
                    comparison = a.reconciliationConfidence - b.reconciliationConfidence;
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });

    }, [reconciledData, searchTerm, sortField, sortDirection]);

    const sortedOverflowData = useMemo(() => {
        return [...overflowData].sort((a, b) => {
            let comparison = 0;
            switch (overflowSortField) {
                case 'date':
                    comparison = a.date.localeCompare(b.date);
                    break;
                case 'medio':
                    comparison = a.medio.localeCompare(b.medio);
                    break;
                case 'originalTitle':
                    comparison = a.originalTitle.localeCompare(b.originalTitle);
                    break;
                case 'franja':
                    comparison = (a.franja || '').localeCompare(b.franja || '');
                    break;
                case 'timeRange':
                    comparison = (a.timeRange || '').localeCompare(b.timeRange || '');
                    break;
                case 'duration':
                    comparison = a.duration - b.duration;
                    break;
                case 'insertions':
                    comparison = a.insertions - b.insertions;
                    break;
                case 'reason':
                    comparison = a.reason.localeCompare(b.reason);
                    break;
            }
            return overflowSortDirection === 'asc' ? comparison : -comparison;
        });
    }, [overflowData, overflowSortField, overflowSortDirection]);

    const sortedNonStandardData = useMemo(() => {
        return [...nonStandardData].sort((a, b) => {
            let comparison = 0;
            switch (nonStandardSortField) {
                case 'date':
                    comparison = a.date.localeCompare(b.date);
                    break;
                case 'medio':
                    comparison = a.medio.localeCompare(b.medio);
                    break;
                case 'originalTitle':
                    comparison = a.originalTitle.localeCompare(b.originalTitle);
                    break;
                case 'franja':
                    comparison = (a.franja || '').localeCompare(b.franja || '');
                    break;
                case 'timeRange':
                    comparison = (a.timeRange || '').localeCompare(b.timeRange || '');
                    break;
                case 'duration':
                    comparison = a.duration - b.duration;
                    break;
                case 'insertions':
                    comparison = a.insertions - b.insertions;
                    break;
                case 'reason':
                    comparison = a.reason.localeCompare(b.reason);
                    break;
            }
            return nonStandardSortDirection === 'asc' ? comparison : -comparison;
        });
    }, [nonStandardData, nonStandardSortField, nonStandardSortDirection]);

    const stats = useMemo(() => {
        if (!reconciledData) return null;

        const totalOrdered = reconciledData.reduce((sum, row) => sum + row.orderedQuantity, 0);
        const totalInserted = reconciledData.reduce((sum, row) => sum + row.totalInserted, 0);

        const underDelivered = reconciledData.filter(row => row.status === 'under').length;
        const overDelivered = reconciledData.filter(row => row.status === 'over').length;
        const missing = reconciledData.filter(row => row.status === 'missing').length;

        const confidenceDistribution = {
            high: reconciledData.filter(row => row.reconciliationConfidence >= 90).length,
            medium: reconciledData.filter(row => row.reconciliationConfidence >= 70 && row.reconciliationConfidence < 90).length,
            low: reconciledData.filter(row => row.reconciliationConfidence < 70).length
        };

        const overflowCount = overflowData.reduce((sum, item) => sum + item.insertions, 0);
        const nonStandardCount = nonStandardData.reduce((sum, item) => sum + item.insertions, 0);

        const deliveryByMedio = reconciledData.reduce((acc, row) => {
            const medio = row.medio || 'Unknown';
            if (!acc[medio]) acc[medio] = { missing: 0, under: 0, over: 0 };
            if (row.status === 'missing') acc[medio].missing++;
            if (row.status === 'under') acc[medio].under++;
            if (row.status === 'over') acc[medio].over++;
            return acc;
        }, {} as Record<string, { missing: number, under: number, over: number }>);

        return {
            totalOrdered,
            totalInserted,
            underDelivered,
            overDelivered,
            missing,
            overflowCount,
            nonStandardCount,
            confidenceDistribution,
            deliveryByMedio
        };
    }, [reconciledData, overflowData, nonStandardData]);

    const exportToExcel = () => {
        if (!reconciledData) return;

        // 1. Prepare Reconciled Worksheet
        const reconciledHeaders = ['Date', 'Medio', 'Program', 'Schedule', 'Original Title', 'Duration', 'Ordered Qty', 'Insertion', 'Confidence', 'Status'];
        const reconciledRows = filteredAndSortedData.map(row => ({
            'Date': row.date,
            'Medio': row.medio,
            'Program': row.program,
            'Schedule': row.schedule || '',
            'Original Title': row.originalTitle,
            'Duration': row.durationSeconds || 0,
            'Ordered Qty': row.orderedQuantity,
            'Insertion': row.totalInserted,
            'Confidence': row.reconciliationConfidence,
            'Status': row.status
        }));

        const wb = utils.book_new();
        const wsReconciled = utils.json_to_sheet(reconciledRows, { header: reconciledHeaders });
        utils.book_append_sheet(wb, wsReconciled, "Reconciliation");

        // 2. Prepare Overflow Worksheet
        if (overflowData.length > 0) {
            const overflowHeaders = ['Date', 'Medio', 'Original Title', 'Franja', 'Time Range', 'Duration', 'Insertions', 'Reason'];
            const overflowRows = sortedOverflowData.map(row => ({
                'Date': row.date,
                'Medio': row.medio,
                'Original Title': row.originalTitle,
                'Franja': row.franja || '',
                'Time Range': row.timeRange || '',
                'Duration': row.duration,
                'Insertions': row.insertions,
                'Reason': row.reason
            }));
            const wsOverflow = utils.json_to_sheet(overflowRows, { header: overflowHeaders });
            utils.book_append_sheet(wb, wsOverflow, "Overflow-Unmatched");
        }

        // 3. Prepare Non-Standard Worksheet
        if (nonStandardData.length > 0) {
            const nsHeaders = ['Date', 'Medio', 'Original Title', 'Franja', 'Time Range', 'Duration', 'Insertions', 'Reason'];
            const nsRows = nonStandardData.map(row => ({
                'Date': row.date,
                'Medio': row.medio,
                'Original Title': row.originalTitle,
                'Franja': row.franja || '',
                'Time Range': row.timeRange || '',
                'Duration': row.duration,
                'Insertions': row.insertions,
                'Reason': row.reason
            }));
            const wsNs = utils.json_to_sheet(nsRows, { header: nsHeaders });
            utils.book_append_sheet(wb, wsNs, "Non-Standard-Durations");
        }

        // 3. Save File
        writeFile(wb, "reconciliation_summary.xlsx");
    };

    const SortableHeader = <T extends string>({
        field,
        children,
        currentSortField,
        currentSortDirection,
        onSort,
        center
    }: {
        field: T;
        children: React.ReactNode;
        currentSortField: T;
        currentSortDirection: SortDirection;
        onSort: (field: T) => void;
        center?: boolean
    }) => (
        <TableHead
            className="cursor-pointer hover:bg-muted/50 transition-colors bg-card"
            onClick={() => onSort(field)}
        >
            <div className={`flex items-center gap-2 ${center ? 'justify-center' : ''}`}>
                {children}
                <ArrowUpDown className={`w-4 h-4 ${currentSortField === field ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
        </TableHead>
    );

    if (!budgetData && !insertionData) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mb-4 opacity-50" />
                <h3 className="text-lg font-medium">No Data Available</h3>
                <p>Please upload files in the Budget and Insertion Log pages first.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
            {/* Header Area - Sticky (Offsets by global header h-16) */}
            <div className="sticky top-16 z-40 bg-background/80 backdrop-blur-md pb-1 pt-1 -mt-4 -mx-6 px-6 border-b shadow-sm">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch xl:min-h-[90px]">
                    {/* Column 1: Summary Metrics (1x4) - Span 5 */}
                    <div className="w-full xl:col-span-5 h-full">
                        {stats ? (
                            <div className="grid grid-cols-4 gap-2 h-full">
                                <Card className="h-full flex flex-col justify-center text-center shadow-sm">
                                    <CardHeader className="py-1 px-1 bg-muted/10">
                                        <CardTitle className="text-[20px] font-bold text-muted-foreground uppercase tracking-widest">Orders</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex-1 flex flex-col items-center pt-2 px-2 pb-1">
                                        <div className="flex flex-col items-center gap-0.5">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-4xl font-bold">{stats.totalOrdered}</span>
                                                <span className="text-sm font-semibold text-muted-foreground/50">/</span>
                                                <span className="text-4xl font-bold">{stats.totalInserted}</span>
                                            </div>
                                            <div className="flex gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                                <span>Ordered</span>
                                                <span>Inserted</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="h-full flex flex-col justify-center text-center shadow-sm">
                                    <CardHeader className="py-1 px-1 bg-muted/10">
                                        <CardTitle className="text-[20px] font-bold text-muted-foreground uppercase tracking-widest">Delivery</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex-1 flex flex-col items-center pt-2 px-2 pb-1">
                                        <div className="flex flex-col items-center gap-0.5">
                                            {/* Main Total */}
                                            <div className="flex items-baseline gap-1 justify-center">
                                                <span className="text-4xl font-bold">{stats.missing}</span>
                                                <span className="text-sm font-semibold text-muted-foreground/50">/</span>
                                                <span className="text-4xl font-bold">{stats.underDelivered}</span>
                                                <span className="text-sm font-semibold text-muted-foreground/50">/</span>
                                                <span className="text-4xl font-bold">{stats.overDelivered}</span>
                                            </div>
                                            <div className="flex gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                                <span>Miss</span>
                                                <span>Under</span>
                                                <span>Over</span>
                                            </div>

                                            {/* Breakdown by Medio - Below and Side-by-Side */}
                                            <div className="flex flex-row justify-center gap-3 mt-1.5 pt-1.5 border-t border-border/40 w-full">
                                                {Object.entries(stats.deliveryByMedio).map(([medio, counts]) => (
                                                    <div key={medio} className="flex flex-col items-center px-1">
                                                        <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{medio}</span>
                                                        <div className="flex items-baseline gap-0.5">
                                                            <span className="text-[15px] font-bold">{counts.missing}</span>
                                                            <span className="text-[15px] font-semibold text-muted-foreground/30">/</span>
                                                            <span className="text-[15px] font-bold">{counts.under}</span>
                                                            <span className="text-[15px] font-semibold text-muted-foreground/30">/</span>
                                                            <span className="text-[15px] font-bold">{counts.over}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="h-full flex flex-col justify-center text-center shadow-sm">
                                    <CardHeader className="py-1 px-1 bg-muted/10">
                                        <CardTitle className="text-[20px] font-bold text-muted-foreground uppercase tracking-widest">Confidence</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex-1 flex flex-col items-center pt-2 px-2 pb-1">
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-4xl font-bold">{stats.confidenceDistribution.high}</span>
                                                <span className="text-base font-semibold text-muted-foreground/50">/</span>
                                                <span className="text-4xl font-bold">{stats.confidenceDistribution.medium}</span>
                                                <span className="text-base font-semibold text-muted-foreground/50">/</span>
                                                <span className="text-4xl font-bold">{stats.confidenceDistribution.low}</span>
                                            </div>
                                            <div className="flex gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                <span>High</span>
                                                <span>Med</span>
                                                <span>Low</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="h-full flex flex-col justify-center text-center shadow-sm">
                                    <CardHeader className="py-1 px-1 bg-muted/10">
                                        <CardTitle className="text-[20px] font-bold text-muted-foreground uppercase tracking-widest">Unreconciled</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex-1 flex flex-col items-center pt-2 px-2 pb-1">
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-4xl font-bold">{stats.overflowCount}</span>
                                                <span className="text-base font-semibold text-muted-foreground/50">/</span>
                                                <span className="text-4xl font-bold">{stats.nonStandardCount}</span>
                                            </div>
                                            <div className="flex gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                                <span>Overflow</span>
                                                <span>Inv. Dur</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center border-2 border-dashed rounded-xl bg-muted/20 text-muted-foreground">
                                <p className="text-xs">Metrics pending</p>
                            </div>
                        )}
                    </div>

                    {/* Column 2: Filter - Span 2 */}
                    <div className="hidden xl:flex w-full xl:col-span-2 h-full flex-col gap-2">
                        <Card className="h-full flex flex-col text-center shadow-sm">
                            <CardHeader className="py-1 px-1 bg-muted/10">
                                <CardTitle className="text-[10px] font-bold text-muted-foreground text-center uppercase tracking-widest">
                                    Filter
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-2 pb-2 pt-1 flex-1">
                                <div className="flex flex-col gap-1.5">
                                    {/* Row 1: Month and Day */}
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <MonthFilter
                                            selectedMonths={selectedMonths}
                                            onChange={handleMonthChange}
                                        />
                                        <DayFilter
                                            selectedDays={selectedDays}
                                            onDayChange={handleDayChange}
                                        />
                                    </div>

                                    {/* Row 2: Medio Filter (Half Width) */}
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <MedioFilter
                                            medios={availableMedios}
                                            selectedMedios={selectedMedios}
                                            onMedioChange={handleMedioChange}
                                        />
                                        <div />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Column 3: Sources & Actions (Side-by-Side) - Span 3 */}
                    <div className="w-full xl:col-span-3 flex flex-col gap-2 h-full">
                        {/* Source Cards Grid */}
                        <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
                            <Card className="flex flex-col min-w-0 shadow-sm overflow-hidden text-[10px]">
                                <CardHeader className="py-2 px-1 text-center bg-muted/10">
                                    <CardTitle className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center justify-center gap-1">
                                        <FileText className="w-2.5 h-2.5" />
                                        Budget
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-2 flex flex-col h-full justify-between overflow-hidden">
                                    <div className="space-y-1 overflow-auto max-h-[60px] pr-1 custom-scrollbar">
                                        {(() => {
                                            const names = budgetData?.fileNames || budgetData?.fileName;
                                            if (!names) return <span className="text-muted-foreground italic">-</span>;
                                            const nameList = Array.isArray(names) ? names : String(names).split(',').map(s => s.trim());
                                            return nameList.map((name, i) => (
                                                <div key={i} className="font-medium text-[10px] leading-tight break-all border-l-2 border-primary/40 pl-1.5 py-0.5" title={name}>
                                                    {name}
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                    <div className="text-[8px] text-muted-foreground mt-1 text-right font-bold uppercase tracking-tighter opacity-70">
                                        {budgetData?.data?.length || 0} rows
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="flex flex-col min-w-0 shadow-sm overflow-hidden text-[10px]">
                                <CardHeader className="py-2 px-1 text-center bg-muted/10">
                                    <CardTitle className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center justify-center gap-1">
                                        <FileText className="w-2.5 h-2.5" />
                                        Insertion
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-2 flex flex-col h-full justify-between overflow-hidden">
                                    <div className="space-y-1 overflow-auto max-h-[60px] pr-1 custom-scrollbar">
                                        {(() => {
                                            const name = insertionData?.fileName;
                                            if (!name) return <span className="text-muted-foreground italic">-</span>;
                                            return (
                                                <div className="font-medium text-[10px] leading-tight break-all border-l-2 border-primary/40 pl-1.5 py-0.5" title={name}>
                                                    {name}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="text-[8px] text-muted-foreground mt-1 text-right font-bold uppercase tracking-tighter opacity-70">
                                        {insertionData?.data?.length || 0} rows
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Reconcile Button */}
                        <div className="h-8 shrink-0">
                            <Button
                                size="sm"
                                onClick={reconcileData}
                                disabled={isLoading || !budgetData || !insertionData}
                                className="w-full h-full shadow-sm text-[10px]"
                            >
                                {isLoading ? (
                                    <span className="animate-pulse flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-primary-foreground rounded-full animate-bounce" />
                                        Processing...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5">
                                        <Play className="w-3 h-3 fill-current" />
                                        Reconcile
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Column 4: Remainder Spacing - Span 2 */}
                    <div className="hidden xl:block xl:col-span-2"></div>
                </div>
            </div>

            {/* Results Area */}
            {reconciledData && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search results..."
                                value={searchTerm}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Button variant="outline" onClick={exportToExcel} className="gap-2">
                            <Download className="w-4 h-4" />
                            Export Excel
                        </Button>
                    </div>

                    {/* Main Budget Table */}
                    <div className="rounded-xl border bg-card">
                        <div className="p-3 border-b bg-muted/30">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                Budget Reconciliation
                            </h3>
                        </div>
                        <div className="max-h-[800px] overflow-auto">
                            <table className="w-full caption-bottom text-sm">
                                <TableHeader className="sticky top-0 z-20 bg-card shadow-sm">
                                    <TableRow>
                                        <SortableHeader field="date" currentSortField={sortField} onSort={handleSort} currentSortDirection={sortDirection}>Date</SortableHeader>
                                        <SortableHeader field="medio" currentSortField={sortField} onSort={handleSort} currentSortDirection={sortDirection}>Medio</SortableHeader>
                                        <SortableHeader field="program" currentSortField={sortField} onSort={handleSort} currentSortDirection={sortDirection}>Program</SortableHeader>
                                        <SortableHeader field="schedule" currentSortField={sortField} onSort={handleSort} currentSortDirection={sortDirection}>Schedule</SortableHeader>
                                        <SortableHeader field="originalTitle" currentSortField={sortField} onSort={handleSort} currentSortDirection={sortDirection}>Original Title</SortableHeader>
                                        <SortableHeader field="durationSeconds" currentSortField={sortField} onSort={handleSort} currentSortDirection={sortDirection} center>Duration</SortableHeader>
                                        <SortableHeader field="orderedQuantity" currentSortField={sortField} onSort={handleSort} currentSortDirection={sortDirection} center>Ordered Qty</SortableHeader>
                                        <SortableHeader field="totalInserted" currentSortField={sortField} onSort={handleSort} currentSortDirection={sortDirection} center>Insertion</SortableHeader>
                                        <SortableHeader field="reconciliationConfidence" currentSortField={sortField} onSort={handleSort} currentSortDirection={sortDirection} center>Confidence</SortableHeader>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAndSortedData.map((row, idx) => (
                                        <TableRow key={idx} className="hover:bg-muted/50">
                                            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                                                {row.date}
                                            </TableCell>
                                            <TableCell className="font-medium text-xs">
                                                {row.medio}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {row.program}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {row.schedule || '-'}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={row.originalTitle}>
                                                {row.originalTitle}
                                            </TableCell>
                                            <TableCell className="text-center text-xs">
                                                {row.durationSeconds || '-'}s
                                            </TableCell>
                                            <TableCell className="text-center font-bold">
                                                {row.orderedQuantity}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className={`font-medium ${row.status === 'missing' ? 'text-red-500' : row.status === 'over' ? 'text-blue-500' : row.status === 'under' ? 'text-orange-500' : 'text-green-600'}`}>
                                                    {row.totalInserted}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {row.reconciliationConfidence > 0 ? (
                                                    <div className={`
                                                        inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                                                        ${row.reconciliationConfidence >= 90 ? 'bg-green-100 text-green-700' :
                                                            row.reconciliationConfidence >= 70 ? 'bg-yellow-100 text-yellow-700' :
                                                                'bg-red-100 text-red-700'}
                                                    `}>
                                                        {row.reconciliationConfidence}%
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </table>
                        </div>
                    </div>

                    {/* Accordion for Overflow and Non-Standard Data */}
                    {(overflowData.length > 0 || nonStandardData.length > 0) && (
                        <Accordion type="single" collapsible value={accordionValue} onValueChange={handleAccordionChange} className="w-full">
                            <AccordionItem value="details" className="border-none">
                                <AccordionTrigger className="hover:no-underline py-2 px-4 bg-muted/40 rounded-lg border">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground w-full">
                                        <AlertCircle className="w-4 h-4" />
                                        <span>
                                            Overflow / Unmatched Items ({overflowData.length}) / Non-Standard Durations (Excluded from Match) ({nonStandardData.length})
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-1 space-y-4">
                                    {/* Overflow / Unmatched Table */}
                                    {overflowData.length > 0 && (
                                        <div className="rounded-xl border bg-card border-red-200">
                                            <div className="p-3 border-b bg-red-50">
                                                <h3 className="font-semibold text-sm flex items-center gap-2 text-red-700">
                                                    Overflow / Unmatched Items ({overflowData.length})
                                                </h3>
                                            </div>
                                            <div className="max-h-[300px] overflow-auto">
                                                <table className="w-full caption-bottom text-sm">
                                                    <TableHeader className="sticky top-0 z-20 bg-card shadow-sm">
                                                        <TableRow>
                                                            <SortableHeader field="date" currentSortField={overflowSortField} onSort={handleOverflowSort} currentSortDirection={overflowSortDirection}>Date</SortableHeader>
                                                            <SortableHeader field="medio" currentSortField={overflowSortField} onSort={handleOverflowSort} currentSortDirection={overflowSortDirection}>Medio</SortableHeader>
                                                            <SortableHeader field="originalTitle" currentSortField={overflowSortField} onSort={handleOverflowSort} currentSortDirection={overflowSortDirection}>Original Title</SortableHeader>
                                                            <SortableHeader field="franja" currentSortField={overflowSortField} onSort={handleOverflowSort} currentSortDirection={overflowSortDirection}>Franja</SortableHeader>
                                                            <SortableHeader field="timeRange" currentSortField={overflowSortField} onSort={handleOverflowSort} currentSortDirection={overflowSortDirection}>Time Range</SortableHeader>
                                                            <SortableHeader field="duration" currentSortField={overflowSortField} onSort={handleOverflowSort} currentSortDirection={overflowSortDirection} center>Duration</SortableHeader>
                                                            <SortableHeader field="insertions" currentSortField={overflowSortField} onSort={handleOverflowSort} currentSortDirection={overflowSortDirection} center>Insertions</SortableHeader>
                                                            <SortableHeader field="reason" currentSortField={overflowSortField} onSort={handleOverflowSort} currentSortDirection={overflowSortDirection}>Reason</SortableHeader>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {sortedOverflowData.map((row, idx) => (
                                                            <TableRow key={idx} className="hover:bg-muted/50">
                                                                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                                                                    {row.date}
                                                                </TableCell>
                                                                <TableCell className="font-medium text-xs">
                                                                    {row.medio}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={row.originalTitle}>
                                                                    {row.originalTitle}
                                                                </TableCell>
                                                                <TableCell className="text-xs">
                                                                    {row.franja || '-'}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {row.timeRange || '-'}
                                                                </TableCell>
                                                                <TableCell className="text-center text-xs">
                                                                    {row.duration}s
                                                                </TableCell>
                                                                <TableCell className="text-center font-bold text-red-600">
                                                                    {row.insertions}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge variant={
                                                                        row.reason === 'Exceeded Order Qty' ? 'default' :
                                                                            row.reason === 'No Matching Budget' || row.reason === 'Budget Full' ? 'destructive' :
                                                                                'outline'
                                                                    } className="text-[10px]">
                                                                        {row.reason}
                                                                    </Badge>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Non-Standard Durations Table */}
                                    {nonStandardData.length > 0 && (
                                        <div className="rounded-xl border bg-card border-orange-200">
                                            <div className="p-3 border-b bg-orange-50">
                                                <h3 className="font-semibold text-sm flex items-center gap-2 text-orange-700">
                                                    Non-Standard Durations (Excluded from Match) ({nonStandardData.length})
                                                </h3>
                                            </div>
                                            <div className="max-h-[300px] overflow-auto">
                                                <table className="w-full caption-bottom text-sm">
                                                    <TableHeader className="sticky top-0 z-20 bg-orange-50 shadow-sm">
                                                        <TableRow className="hover:bg-transparent">
                                                            <SortableHeader field="date" currentSortField={nonStandardSortField} onSort={handleNonStandardSort} currentSortDirection={nonStandardSortDirection}>Date</SortableHeader>
                                                            <SortableHeader field="medio" currentSortField={nonStandardSortField} onSort={handleNonStandardSort} currentSortDirection={nonStandardSortDirection}>Medio</SortableHeader>
                                                            <SortableHeader field="originalTitle" currentSortField={nonStandardSortField} onSort={handleNonStandardSort} currentSortDirection={nonStandardSortDirection}>Original Title</SortableHeader>
                                                            <SortableHeader field="franja" currentSortField={nonStandardSortField} onSort={handleNonStandardSort} currentSortDirection={nonStandardSortDirection}>Franja</SortableHeader>
                                                            <SortableHeader field="timeRange" currentSortField={nonStandardSortField} onSort={handleNonStandardSort} currentSortDirection={nonStandardSortDirection} center>Time</SortableHeader>
                                                            <SortableHeader field="duration" currentSortField={nonStandardSortField} onSort={handleNonStandardSort} currentSortDirection={nonStandardSortDirection} center>Duration</SortableHeader>
                                                            <SortableHeader field="insertions" currentSortField={nonStandardSortField} onSort={handleNonStandardSort} currentSortDirection={nonStandardSortDirection} center>Insertions</SortableHeader>
                                                            <SortableHeader field="reason" currentSortField={nonStandardSortField} onSort={handleNonStandardSort} currentSortDirection={nonStandardSortDirection}>Reason</SortableHeader>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {sortedNonStandardData.map((row, idx) => (
                                                            <TableRow key={idx} className="hover:bg-orange-100/50">
                                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                                    {row.date}
                                                                </TableCell>
                                                                <TableCell className="font-medium text-xs">
                                                                    {row.medio}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={row.originalTitle}>
                                                                    {row.originalTitle}
                                                                </TableCell>
                                                                <TableCell className="text-xs">
                                                                    {row.franja || '-'}
                                                                </TableCell>
                                                                <TableCell className="text-center text-xs font-mono">
                                                                    {row.timeRange || '-'}
                                                                </TableCell>
                                                                <TableCell className="text-center text-xs">
                                                                    {row.duration}s
                                                                </TableCell>
                                                                <TableCell className="text-center font-medium">
                                                                    {row.insertions}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-orange-600 font-medium">
                                                                    {row.reason}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    )}
                </div>
            )}
        </div>
    );
}
