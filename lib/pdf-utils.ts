import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function exportToPdf(elementId: string, filename: string = 'analysis-report') {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error('Element not found:', elementId);
        return;
    }

    try {
        // Create canvas from the element
        const canvas = await html2canvas(element, {
            scale: 2, // Higher quality
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;

        // Calculate scaling to fit width
        const ratio = pdfWidth / imgWidth;
        const scaledHeight = imgHeight * ratio;

        // Handle multi-page if content is too tall
        let heightLeft = scaledHeight;
        let position = 0;
        let page = 1;

        // Add first page
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, scaledHeight);
        heightLeft -= pdfHeight;

        // Add additional pages if needed
        while (heightLeft > 0) {
            position = -pdfHeight * page;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, scaledHeight);
            heightLeft -= pdfHeight;
            page++;
        }

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0];
        pdf.save(`${filename}_${timestamp}.pdf`);

        return true;
    } catch (error) {
        console.error('PDF export failed:', error);
        throw error;
    }
}
