'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Clock } from 'lucide-react';
import { useFranjaMappings } from '@/hooks/use-franja-mappings';

export function FranjaMappingsCard() {
    const { mappings, updateMapping, addMapping, removeMapping, resetToDefaults, isLoaded } = useFranjaMappings();
    const [newLabel, setNewLabel] = useState('');
    const [newStart, setNewStart] = useState('');
    const [newEnd, setNewEnd] = useState('');

    if (!isLoaded) return null;

    const handleAdd = () => {
        if (!newLabel || !newStart || !newEnd) return;
        addMapping(newLabel, newStart, newEnd);
        setNewLabel('');
        setNewStart('');
        setNewEnd('');
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-500" />
                    Franja Time Definitions
                </CardTitle>
                <CardDescription>
                    Define the time ranges for each Franja key found in your files (e.g., "Manana").
                    The Insertion Log will use these to display a standard time range.
                </CardDescription>
                <div className="absolute right-6 top-6">
                    <Button variant="outline" size="sm" onClick={resetToDefaults}>
                        Reset Defaults
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    {/* Header Row */}
                    <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground px-2">
                        <div className="col-span-4">Franja Name</div>
                        <div className="col-span-3">Start Time</div>
                        <div className="col-span-3">End Time</div>
                        <div className="col-span-2"></div>
                    </div>

                    {/* Mapping List */}
                    {mappings.map((mapping) => (
                        <div key={mapping.label} className="grid grid-cols-12 gap-4 items-center p-2 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="col-span-4 font-medium">
                                {mapping.label}
                            </div>
                            <div className="col-span-3">
                                <Input
                                    value={mapping.startTime}
                                    onChange={(e) => updateMapping(mapping.label, 'startTime', e.target.value)}
                                    placeholder="HH:MM"
                                    className="h-8 font-mono text-sm"
                                />
                            </div>
                            <div className="col-span-3">
                                <Input
                                    value={mapping.endTime}
                                    onChange={(e) => updateMapping(mapping.label, 'endTime', e.target.value)}
                                    placeholder="HH:MM"
                                    className="h-8 font-mono text-sm"
                                />
                            </div>
                            <div className="col-span-2 flex justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeMapping(mapping.label)}
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="h-px bg-border" />

                {/* Add New Section */}
                <div className="space-y-2">
                    <h4 className="text-sm font-medium">Add New Franja Definition</h4>
                    <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-4">
                            <Input
                                placeholder="e.g. Sobremesa"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                            />
                        </div>
                        <div className="col-span-3">
                            <Input
                                placeholder="HH:MM"
                                value={newStart}
                                onChange={(e) => setNewStart(e.target.value)}
                            />
                        </div>
                        <div className="col-span-3">
                            <Input
                                placeholder="HH:MM"
                                value={newEnd}
                                onChange={(e) => setNewEnd(e.target.value)}
                            />
                        </div>
                        <div className="col-span-2 flex justify-end">
                            <Button onClick={handleAdd} disabled={!newLabel || !newStart || !newEnd} size="sm" className="gap-2">
                                <Plus className="w-4 h-4" />
                                Add
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
