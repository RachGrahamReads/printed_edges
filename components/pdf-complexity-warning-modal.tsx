import { AlertCircle, CheckCircle, X } from 'lucide-react';
import type { PDFComplexityMetrics } from '@/lib/pdf-complexity-analyzer';

interface PDFComplexityWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  complexity: PDFComplexityMetrics;
}

export default function PDFComplexityWarningModal({
  isOpen,
  onClose,
  complexity
}: PDFComplexityWarningModalProps) {
  if (!isOpen) return null;

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      default: return 'text-green-600';
    }
  };

  const getRiskBgColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-50 border-red-200';
      case 'medium': return 'bg-yellow-50 border-yellow-200';
      default: return 'bg-green-50 border-green-200';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b">
          <div className="flex items-start gap-3">
            <AlertCircle className={`h-6 w-6 ${getRiskColor(complexity.riskLevel)} mt-0.5`} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                PDF Complexity Detected
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                This PDF has been analyzed for potential processing issues
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Risk Level Card */}
          <div className={`rounded-lg border-2 p-4 ${getRiskBgColor(complexity.riskLevel)}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-600">Risk Level</div>
                <div className={`text-2xl font-bold ${getRiskColor(complexity.riskLevel)} uppercase`}>
                  {complexity.riskLevel}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-600">Complexity Score</div>
                <div className="text-2xl font-bold text-gray-900">
                  {complexity.complexityScore}/100
                </div>
              </div>
            </div>
          </div>

          {/* File Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-gray-600">File Size</div>
              <div className="text-lg font-semibold text-gray-900">{complexity.fileSizeMB}MB</div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">Page Count</div>
              <div className="text-lg font-semibold text-gray-900">{complexity.pageCount} pages</div>
            </div>
          </div>

          {/* Risk Factors */}
          {complexity.riskFactors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Detected Issues:</h3>
              <ul className="space-y-2">
                {complexity.riskFactors.map((factor, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                    <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              💡 Recommendations
            </h3>
            <ul className="space-y-1.5 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span><strong>Flatten your PDF</strong> using Adobe Acrobat or similar tools</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span><strong>Reduce embedded fonts</strong> by converting text to outlines</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span><strong>Optimize images</strong> before embedding in the PDF</span>
              </li>
              {complexity.riskLevel === 'high' && (
                <li className="flex items-start gap-2 mt-3 pt-3 border-t border-blue-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-600" />
                  <span className="text-red-700">
                    <strong>High-complexity PDFs often fail processing.</strong> We strongly recommend flattening this PDF first to avoid wasting credits.
                  </span>
                </li>
              )}
            </ul>
          </div>

          {/* Detailed Stats (collapsed by default) */}
          <details className="border rounded-lg">
            <summary className="cursor-pointer p-4 hover:bg-gray-50 font-medium text-gray-900">
              View Detailed Analysis
            </summary>
            <div className="p-4 border-t space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium text-gray-600">Embedded Fonts:</span>
                  <span className="ml-2 text-gray-900">{complexity.totalFonts}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Embedded Images:</span>
                  <span className="ml-2 text-gray-900">{complexity.totalImages}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Transparency:</span>
                  <span className="ml-2 text-gray-900">{complexity.hasTransparency ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Form Fields:</span>
                  <span className="ml-2 text-gray-900">{complexity.hasAnnotations ? 'Yes' : 'No'}</span>
                </div>
              </div>
              {complexity.fontNames.length > 0 && (
                <div>
                  <div className="font-medium text-gray-600 mb-1">Font Names:</div>
                  <div className="text-gray-700 text-xs font-mono bg-gray-50 p-2 rounded">
                    {complexity.fontNames.slice(0, 10).join(', ')}
                    {complexity.fontNames.length > 10 && ` ... +${complexity.fontNames.length - 10} more`}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 p-6 border-t bg-gray-50">
          <p className="text-sm text-gray-600">
            Processing complex PDFs uses credits even if they fail.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
