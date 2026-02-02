import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, CalendarIcon, X, Clock, Tv } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MonthFilterProps {
    selectedMonths: string[];
    onChange: (months: string[]) => void;
}

export function MonthFilter({ selectedMonths, onChange }: MonthFilterProps) {
    const [open, setOpen] = React.useState(false);

    // Simple months generation
    const months = React.useMemo(() => {
        const result = [];
        const today = new Date();
        for (let i = -24; i <= 12; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
            result.push({ value, label });
        }
        return result.reverse();
    }, []);

    const toggleMonth = (val: string) => {
        if (selectedMonths.includes(val)) {
            onChange(selectedMonths.filter(m => m !== val));
        } else {
            onChange([...selectedMonths, val]);
        }
    };

    // Get display labels for selected months
    const getSelectedLabels = () => {
        if (selectedMonths.length === 0) return "Select Months";
        const labels = selectedMonths.map(val => {
            const found = months.find(m => m.value === val);
            return found ? found.label.replace(' 20', "'").replace(/uary|uary|rch|il|y|e|ust|ber|ober|ember/g, m => m.charAt(0)) : val;
        });
        return labels.join(', ');
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start h-8 px-2 gap-2">
                    <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-bold text-[10px] truncate" title={selectedMonths.length > 0 ? selectedMonths.map(v => months.find(m => m.value === v)?.label).join(', ') : undefined}>
                        {getSelectedLabels()}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
                <div className="flex flex-col">
                    <div className="p-2 border-b bg-muted/20">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Months</span>
                    </div>

                    <ScrollArea className="h-[200px]">
                        <div className="p-2">
                            {months.map(m => (
                                <div
                                    key={m.value}
                                    className={cn(
                                        "flex items-center gap-2 p-2 hover:bg-muted cursor-pointer rounded-sm mb-1 last:mb-0",
                                        selectedMonths.includes(m.value) && "bg-muted font-medium"
                                    )}
                                    onClick={() => toggleMonth(m.value)}
                                >
                                    <div className={cn("w-4 h-4 border rounded-sm flex items-center justify-center transition-colors", selectedMonths.includes(m.value) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground")}>
                                        {selectedMonths.includes(m.value) && <Check className="w-3 h-3" />}
                                    </div>
                                    <span className="text-sm">{m.label}</span>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            </PopoverContent>
        </Popover>
    );
}

interface DayFilterProps {
    selectedDays: number[];
    onDayChange: (days: number[]) => void;
}

export function DayFilter({ selectedDays, onDayChange }: DayFilterProps) {
    const [open, setOpen] = React.useState(false);
    const days = Array.from({ length: 31 }, (_, i) => i + 1);

    const toggleDay = (day: number) => {
        if (selectedDays.includes(day)) {
            onDayChange(selectedDays.filter(d => d !== day));
        } else {
            onDayChange([...selectedDays, day]);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-between h-8 px-2", selectedDays.length > 0 && "bg-muted/50 border-muted-foreground/30")}>
                    <div className="flex items-center gap-2 min-w-0">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-bold text-[10px] truncate" title={selectedDays.length > 0 ? selectedDays.sort((a, b) => a - b).join(', ') : undefined}>
                            {selectedDays.length === 0 ? "Filter by Day" : selectedDays.length === 31 ? "All Days" : selectedDays.sort((a, b) => a - b).join(', ')}
                        </span>
                    </div>
                    {selectedDays.length > 0 && (
                        <div
                            className="ml-auto h-4 w-4 rounded-full hover:bg-muted flex items-center justify-center cursor-pointer shrink-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDayChange([]);
                            }}
                        >
                            <X className="w-3 h-3 text-muted-foreground" />
                        </div>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
                <ScrollArea className="h-[200px]">
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Days</span>
                            <div className="flex gap-2">
                                <span
                                    className="text-[10px] text-primary cursor-pointer hover:underline"
                                    onClick={() => onDayChange(days)}
                                >
                                    Select All
                                </span>
                                <span className="text-[10px] text-muted-foreground">/</span>
                                <span
                                    className="text-[10px] text-primary cursor-pointer hover:underline"
                                    onClick={() => onDayChange([])}
                                >
                                    Deselect All
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {days.map(d => (
                                <button
                                    key={d}
                                    onClick={() => toggleDay(d)}
                                    className={cn(
                                        "h-8 w-8 text-sm rounded-md flex items-center justify-center transition-all border",
                                        selectedDays.includes(d)
                                            ? "bg-primary text-primary-foreground border-primary font-bold shadow-sm"
                                            : "hover:bg-muted border-transparent text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>

                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}

interface MedioFilterProps {
    medios: string[];
    selectedMedios: string[];
    onMedioChange: (medios: string[]) => void;
}

export function MedioFilter({ medios, selectedMedios, onMedioChange }: MedioFilterProps) {
    const [open, setOpen] = React.useState(false);

    const toggleMedio = (medio: string) => {
        if (selectedMedios.includes(medio)) {
            onMedioChange(selectedMedios.filter(m => m !== medio));
        } else {
            onMedioChange([...selectedMedios, medio]);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-between h-8 px-2", selectedMedios.length > 0 && "bg-muted/50 border-muted-foreground/30")}>
                    <div className="flex items-center gap-2 min-w-0">
                        <Tv className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-bold text-[10px] truncate" title={selectedMedios.length > 0 ? selectedMedios.join(', ') : undefined}>
                            {selectedMedios.length === 0 ? "Select Medios" : selectedMedios.join(', ')}
                        </span>
                    </div>
                    {selectedMedios.length > 0 && (
                        <div
                            className="ml-auto h-4 w-4 rounded-full hover:bg-muted flex items-center justify-center cursor-pointer shrink-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                onMedioChange([]);
                            }}
                        >
                            <X className="w-3 h-3 text-muted-foreground" />
                        </div>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
                <div className="flex flex-col">
                    <div className="p-2 border-b bg-muted/20">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Medios</span>
                    </div>

                    <ScrollArea className="h-[200px]">
                        <div className="p-2">
                            {medios.map(m => (
                                <div
                                    key={m}
                                    className={cn(
                                        "flex items-center gap-2 p-2 hover:bg-muted cursor-pointer rounded-sm mb-1 last:mb-0",
                                        selectedMedios.includes(m) && "bg-muted font-medium"
                                    )}
                                    onClick={() => toggleMedio(m)}
                                >
                                    <div className={cn("w-4 h-4 border rounded-sm flex items-center justify-center transition-colors", selectedMedios.includes(m) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground")}>
                                        {selectedMedios.includes(m) && <Check className="w-3 h-3" />}
                                    </div>
                                    <span className="text-sm">{m}</span>
                                </div>
                            ))}
                            {medios.length === 0 && (
                                <div className="p-4 text-center text-muted-foreground text-xs">
                                    No medios found in budget data.
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </PopoverContent>
        </Popover>
    );
}
