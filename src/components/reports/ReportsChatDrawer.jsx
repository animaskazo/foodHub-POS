import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Send, Loader2, Bot, User, HelpCircle } from 'lucide-react';
import { analyzeReportWithAI } from '../../services/aiService';

const SUGGESTED_PROMPTS = [
  '¿Cuál es el resumen ejecutivo de este mes?',
  '¿Cuál fue mi mejor día en ventas?',
  '¿Qué canal de venta genera más ingresos?',
  '¿Cuáles son mis productos estrella?',
  '¿En qué horario se concentran más las ventas?',
];

// Helper to render markdown bold / lists simply
const renderMarkdown = (text) => {
  if (!text) return '';

  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Bold replacement **bold**
    let parts = line.split(/(\*\*.*?\*\*)/g).map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      return (
        <li key={i} className="ml-4 list-disc my-1 text-gray-700">
          {parts}
        </li>
      );
    }

    if (/^\d+\.\s/.test(line.trim())) {
      return (
        <li key={i} className="ml-4 list-decimal my-1 text-gray-700">
          {parts}
        </li>
      );
    }

    if (line.trim() === '') {
      return <div key={i} className="h-2" />;
    }

    return <p key={i} className="my-1 text-gray-700 leading-relaxed">{parts}</p>;
  });
};

const ReportsChatDrawer = ({ isOpen, onClose, reportData }) => {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: '¡Hola! Soy **FoodHub BI**, tu asistente de inteligencia de negocios. Puedo analizar los datos del reporte del mes actual y responder cualquier pregunta que tengas. ¿En qué te puedo ayudar hoy?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (questionToSend) => {
    const query = (questionToSend || input).trim();
    if (!query || loading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: query,
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!questionToSend) setInput('');
    setLoading(true);

    try {
      // Build history payload
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      const answer = await analyzeReportWithAI(query, reportData, history);

      const aiMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: answer,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      console.error('Error al obtener respuesta de BI:', err);
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `⚠️ No pude analizar los datos en este momento: ${err.message || 'Error de conexión'}. Inténtalo nuevamente.`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs transition-opacity">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex items-center justify-between border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  FoodHub BI <span className="text-[10px] bg-emerald-500/30 text-emerald-300 font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">IA</span>
                </h3>
                <p className="text-xs text-gray-400">Asistente de Reportes y Ventas</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-gray-900 text-white rounded-br-none'
                      : 'bg-white text-gray-800 border border-gray-200/80 rounded-bl-none'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <div>{renderMarkdown(msg.text)}</div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-gray-200 text-gray-600 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 items-center text-gray-400 text-xs py-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 animate-pulse" />
                </div>
                <div className="bg-white border border-gray-200/80 rounded-2xl px-4 py-2.5 flex items-center gap-2 text-gray-500 shadow-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>Analizando los datos del reporte...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Prompts */}
          <div className="p-3 bg-white border-t border-gray-100 overflow-x-auto hide-scrollbar">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 mb-2">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Preguntas sugeridas:</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
              {SUGGESTED_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(prompt)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-gray-600 rounded-xl text-xs whitespace-nowrap transition-colors border border-gray-200/60 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Input area */}
          <div className="p-3 bg-white border-t border-gray-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pregunta sobre las ventas del mes..."
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsChatDrawer;
