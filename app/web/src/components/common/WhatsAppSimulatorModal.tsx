import React, { useState } from 'react';
import { Copy, Check, ExternalLink, MessageCircle, X, Smartphone, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface WhatsAppSimulatorModalProps {
  onOpenCustomerVerification?: (token: string) => void;
}

export const WhatsAppSimulatorModal: React.FC<WhatsAppSimulatorModalProps> = ({
  onOpenCustomerVerification,
}) => {
  const { activeSimulatedWhatsAppMessage, setActiveSimulatedWhatsAppMessage } = useApp();
  const [copied, setCopied] = useState(false);

  if (!activeSimulatedWhatsAppMessage) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(activeSimulatedWhatsAppMessage.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenLink = () => {
    if (onOpenCustomerVerification) {
      onOpenCustomerVerification(activeSimulatedWhatsAppMessage.token);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* WhatsApp Header Mockup */}
        <div className="bg-gray-900 dark:bg-gray-950 px-4 py-3 text-white flex items-center justify-between border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-800 dark:bg-gray-900 border border-gray-700 flex items-center justify-center font-bold text-sm">
              <MessageCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight flex items-center gap-2">
                <span>Fiber Dispatch Notifier</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded font-medium border border-emerald-500/30">
                  Official
                </span>
              </div>
              <div className="text-[11px] text-gray-400">
                Pesan ke: {activeSimulatedWhatsAppMessage.customerName} ({activeSimulatedWhatsAppMessage.phone})
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveSimulatedWhatsAppMessage(null)}
            className="p-1 hover:bg-gray-800 dark:hover:bg-gray-900 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WhatsApp Chat Body */}
        <div className="p-4 bg-gray-50 dark:bg-gray-950 max-h-[380px] overflow-y-auto">
          <div className="text-center my-2">
            <span className="bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 text-[10px] font-medium px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-800 shadow-2xs">
              Hari ini, {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl p-3.5 shadow-xs border border-gray-200 dark:border-gray-800 text-sm space-y-3">
            <p className="text-gray-800 dark:text-gray-200 whitespace-pre-line leading-relaxed text-xs">
              {activeSimulatedWhatsAppMessage.text}
            </p>

            <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-col gap-2">
              <div className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Tautan Verifikasi Unik:</span>
              </div>
              <div className="text-xs font-mono bg-white dark:bg-gray-900 p-2 rounded-md border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 break-all">
                {activeSimulatedWhatsAppMessage.link}
              </div>
            </div>

            <div className="text-right text-[10px] text-gray-400 dark:text-gray-500">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Terkirim
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full sm:w-1/2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-xs transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Tersalin ke Clipboard</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span>Salin Tautan</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenLink}
            className="w-full sm:w-1/2 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-white text-white dark:text-gray-900 font-medium text-xs shadow-xs transition-colors"
          >
            <span>Buka Sebagai Customer</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
