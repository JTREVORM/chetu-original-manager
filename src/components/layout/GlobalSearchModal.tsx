import React, { useState, useEffect } from "react";
import { useNavigate } from "../../lib/router-compat";
import { useDatabase } from "../../context/DatabaseContext";
import { Search, X, Users, Receipt, Briefcase, ChevronRight } from "lucide-react";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState("");
  const { performGlobalSearch } = useDatabase();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const results = performGlobalSearch(query);

  const handleSelect = (link: string) => {
    navigate(link);
    onClose();
    setQuery("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-2 sm:px-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-modal border border-slate-200 w-full max-w-lg sm:max-w-xl overflow-hidden">
        {/* Input Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <Search className="w-5 h-5 text-chetu-blue" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Client Name, Client #, Loan #, Phone, NIN, Product..."
            className="flex-1 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 scroll-area scroll-y p-2">
          {query.trim().length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40 text-chetu-blue" />
              <p className="text-xs font-medium">Type anything to search system records</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Press{" "}
                <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">Esc</kbd> to
                exit
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <p className="text-xs font-semibold">No records found matching "{query}"</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Check spelling or search by NIN/Phone Number
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Matching Results ({results.length})
              </div>
              {results.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelect(item.link)}
                  className="w-full text-left p-3 rounded-xl hover:bg-slate-50 flex items-center justify-between transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg ${
                        item.type === "Client"
                          ? "bg-blue-100 text-blue-700"
                          : item.type === "Loan"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-purple-100 text-purple-700"
                      }`}
                    >
                      {item.type === "Client" && <Users className="w-4 h-4" />}
                      {item.type === "Loan" && <Receipt className="w-4 h-4" />}
                      {item.type === "Product" && <Briefcase className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-chetu-blue">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 truncate">{item.subtitle}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-chetu-blue group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
