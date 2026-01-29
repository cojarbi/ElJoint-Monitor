import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Get single analysis by ID
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const analysis = await prisma.mediaAnalysis.findUnique({
            where: { id },
        });

        if (!analysis) {
            return NextResponse.json(
                { error: 'Analysis not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ analysis });
    } catch (error) {
        console.error('Failed to fetch analysis:', error);
        return NextResponse.json(
            { error: 'Failed to fetch analysis' },
            { status: 500 }
        );
    }
}

// DELETE - Delete analysis by ID
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        await prisma.mediaAnalysis.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete analysis:', error);
        return NextResponse.json(
            { error: 'Failed to delete analysis' },
            { status: 500 }
        );
    }
}
