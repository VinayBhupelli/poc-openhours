"use client";

import { X } from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}

export default function Modal({ open, onClose, title, children, wide }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-in"
        onClick={onClose}
        style={{ animation: "fadeIn 0.15s ease-out" }}
      />
      <div
        ref={ref}
        className={`relative bg-white rounded-2xl shadow-2xl ${
          wide ? "w-[700px]" : "w-[480px]"
        } max-h-[90vh] flex flex-col overflow-hidden animate-scale-in`}
        style={{ animation: "scaleIn 0.2s ease-out" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
