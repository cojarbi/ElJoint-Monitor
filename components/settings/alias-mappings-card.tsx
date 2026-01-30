'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAliasMappings, AliasMapping } from "@/hooks/use-alias-mappings";
import { ArrowRight, Plus, Trash2, MapPin } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface MappingTableProps {
    title: string;
    description: string;
    mappings: AliasMapping[];
    onAdd: (input: string, output: string) => void;
    onRemove: (input: string) => void;
}

function MappingSection({ title, description, mappings, onAdd, onRemove }: MappingTableProps) {
    const [newInput, setNewInput] = useState('');
    const [newOutput, setNewOutput] = useState('');

    const handleAdd = () => {
        if (!newInput.trim() || !newOutput.trim()) return;
        onAdd(newInput, newOutput);
        setNewInput('');
        setNewOutput('');
    };

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <h3 className="font-medium flex items-center gap-2">
                    {title}
                    <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {mappings.length}
                    </span>
                </h3>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            <div className="flex items-end gap-2 p-3 border rounded-lg bg-muted/20">
                <div className="grid gap-1.5 flex-1">
                    <Label htmlFor={`input-${title}`} className="text-xs">Input (Exact Match)</Label>
                    <Input
                        id={`input-${title}`}
                        placeholder="e.g. TVN-2"
                        value={newInput}
                        onChange={(e) => setNewInput(e.target.value)}
                        className="h-8 text-sm"
                    />
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground mb-2" />
                <div className="grid gap-1.5 flex-1">
                    <Label htmlFor={`output-${title}`} className="text-xs">Maps To</Label>
                    <Input
                        id={`output-${title}`}
                        placeholder="e.g. TVN"
                        value={newOutput}
                        onChange={(e) => setNewOutput(e.target.value)}
                        className="h-8 text-sm"
                    />
                </div>
                <Button size="sm" onClick={handleAdd} disabled={!newInput || !newOutput} className="h-8">
                    <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
            </div>

            <div className="border rounded-md overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="h-8">Input</TableHead>
                            <TableHead className="h-8">Mapped Value</TableHead>
                            <TableHead className="h-8 w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {mappings.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                                    No mappings defined.
                                </TableCell>
                            </TableRow>
                        ) : (
                            mappings.map((m, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="font-mono text-xs">{m.input}</TableCell>
                                    <TableCell className="text-sm font-medium">{m.output}</TableCell>
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                            onClick={() => onRemove(m.input)}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

export function AliasMappingsCard() {
    const { medios, programs, addMedioAlias, removeMedioAlias, addProgramAlias, removeProgramAlias, isLoaded } = useAliasMappings();

    if (!isLoaded) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-indigo-500" />
                    Deterministic Alias Mappings
                </CardTitle>
                <CardDescription>
                    Define exact text replacements to handle variations before AI processing.
                    These rules are applied first and are 100% deterministic.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-8">
                <MappingSection
                    title="Medio / Channel Mappings"
                    description="Standardize channel names (e.g. 'TM' -> 'MEDCOM')."
                    mappings={medios}
                    onAdd={addMedioAlias}
                    onRemove={removeMedioAlias}
                />

                <div className="h-px bg-border" />

                <MappingSection
                    title="Program Category Mappings"
                    description="Standardize genres or program types (e.g. 'NOTICIAS' -> 'Noticiero')."
                    mappings={programs}
                    onAdd={addProgramAlias}
                    onRemove={removeProgramAlias}
                />
            </CardContent>
        </Card>
    );
}
