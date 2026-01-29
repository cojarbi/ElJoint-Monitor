import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - List all saved analyses
export async function GET() {
    try {
        const analyses = await prisma.mediaAnalysis.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                planFileName: true,
                execFileName: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ analyses });
    } catch (error) {
        console.error('Failed to fetch analyses:', error);
        return NextResponse.json(
            { error: 'Failed to fetch analyses' },
            { status: 500 }
        );
    }
}

// POST - Save a new analysis
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const {
            name,
            planFileName,
            execFileName,
            analysis,
            metrics,
            summary,
            discrepancies,
            recommendations,
        } = body;

        // Validate required fields
        if (!planFileName || !execFileName || !analysis) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Auto-generate name if not provided
        const analysisName = name || `Analysis ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

        const saved = await prisma.mediaAnalysis.create({
            data: {
                name: analysisName,
                planFileName,
                execFileName,
                analysis,
                metrics: metrics || {},
                summary: summary || {},
                discrepancies: discrepancies || [],
                recommendations: recommendations || [],
            },
        });

        return NextResponse.json({
            success: true,
            id: saved.id,
            name: saved.name
        });
    } catch (error) {
        console.error('Failed to save analysis:', error);
        return NextResponse.json(
            { error: 'Failed to save analysis' },
            { status: 500 }
        );
    }
}
