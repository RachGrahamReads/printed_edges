import { AlertCircle, X, XCircle } from 'lucide-react';

interface PDFComplexityWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  isBlocked?: boolean; // High-risk PDFs are blocked, not just warned
}

export default function PDFComplexityWarningModal({
  isOpen,
  onClose,
  isBlocked = false
}: PDFComplexityWarningModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b">
          <div className="flex items-start gap-3">
            {isBlocked ? (
              <XCircle className="h-6 w-6 text-red-600 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-6 w-6 text-yellow-600 mt-0.5 flex-shrink-0" />
            )}
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {isBlocked ? 'PDF Cannot Be Processed' : 'Complex PDF Detected'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {isBlocked
                  ? 'This PDF will fail processing'
                  : 'This PDF may not process successfully'
                }
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
        <div className="p-6 space-y-4">
          {isBlocked ? (
            <>
              <p className="text-gray-700">
                Your PDF is a non-flattened file with embedded fonts, images, and transparency layers.
                This combination <strong>will fail processing</strong>.
              </p>
              <p className="text-gray-700">
                <strong>You must flatten this PDF</strong> before it can be processed, or contact support for assistance.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-700">
                Your PDF appears to be complex and may fail processing.
              </p>
              <p className="text-gray-700">
                <strong>Please flatten it and try again</strong>, or contact support for assistance.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            {isBlocked ? 'Close' : 'Cancel'}
          </button>
          {!isBlocked && (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Try Anyway
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
