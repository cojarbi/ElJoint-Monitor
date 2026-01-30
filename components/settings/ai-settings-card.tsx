'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAiModel, AI_MODELS } from "@/hooks/use-ai-settings";
import { Sparkles, Zap, Brain, ShieldAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function AiSettingsCard() {
    const { model, setModel, enableFallback, setEnableFallback, isLoaded } = useAiModel();

    if (!isLoaded) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    AI Model Selection
                </CardTitle>
                <CardDescription>
                    Choose the Gemini model used for parsing files and reconciling data.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <RadioGroup
                    defaultValue={model}
                    onValueChange={(value) => setModel(value as any)}
                    className="grid gap-4"
                >
                    <div className="flex items-start space-x-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setModel(AI_MODELS.FLASH)}>
                        <RadioGroupItem value={AI_MODELS.FLASH} id="flash" className="mt-1" />
                        <div className="flex-1 space-y-1">
                            <Label htmlFor="flash" className="font-medium flex items-center gap-2 cursor-pointer">
                                <Zap className="h-4 w-4 text-orange-500" />
                                Gemini 3 Flash Preview
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Optimized for speed and efficiency. Best for quick processing of standard logs.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setModel(AI_MODELS.PRO)}>
                        <RadioGroupItem value={AI_MODELS.PRO} id="pro" className="mt-1" />
                        <div className="flex-1 space-y-1">
                            <Label htmlFor="pro" className="font-medium flex items-center gap-2 cursor-pointer">
                                <Brain className="h-4 w-4 text-blue-500" />
                                Gemini 3 Pro Preview
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Enhanced reasoning capabilities. Better for complex layouts or fuzzy text matching.
                            </p>
                        </div>
                    </div>
                </RadioGroup>

                <div className="mt-8 pt-6 border-t">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <Label htmlFor="fallback-mode" className="font-medium flex items-center gap-2">
                                <ShieldAlert className="h-4 w-4 text-amber-500" />
                                Legacy Fallback Mode
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Use heuristic matching if AI fails to detect content blocks.
                            </p>
                        </div>
                        <Switch
                            id="fallback-mode"
                            checked={enableFallback}
                            onCheckedChange={setEnableFallback}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
