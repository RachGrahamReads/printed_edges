"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DeleteDesignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  designName: string;
  isDeleting?: boolean;
}

export function DeleteDesignModal({
  isOpen,
  onClose,
  onConfirm,
  designName,
  isDeleting = false
}: DeleteDesignModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const isConfirmValid = confirmText.toLowerCase() === "delete";

  const handleConfirm = async () => {
    if (isConfirmValid) {
      await onConfirm();
      setConfirmText("");
      onClose();
    }
  };

  const handleClose = () => {
    setConfirmText("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Delete Edge Design
            </h3>
          </div>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              You are about to permanently delete the edge design:
            </p>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="font-medium text-gray-900">{designName}</p>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-red-800 font-medium mb-2">Warning:</p>
                <ul className="text-red-700 space-y-1">
                  <li>• This action cannot be undone</li>
                  <li>• All design data and slices will be permanently deleted</li>
                  <li>• You will need to create a new design with a new credit if you want to use this edge design again</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm-delete" className="block text-sm font-medium text-gray-700">
              Type <span className="font-bold">delete</span> to confirm:
            </label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete"
              disabled={isDeleting}
              className="w-full"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t bg-gray-50 rounded-b-lg">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isDeleting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isConfirmValid || isDeleting}
            className="flex-1"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              'Delete Design'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}