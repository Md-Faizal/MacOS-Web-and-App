import React, { useState } from 'react';
import { X, Plus, Check, BarChart2, TrendingUp, Users, DollarSign, PieChart, Layers } from 'lucide-react';

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (widgetName: string) => void;
}

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([]);

  if (!isOpen) return null;

  const availableWidgets = [
    {
      id: 'churn_rate',
      title: 'Net Revenue Churn',
      desc: 'Track expansion revenue vs logo churn by tier',
      icon: TrendingUp,
      category: 'Retention',
    },
    {
      id: 'fraud_velocity',
      title: '3DS Fraud Velocity',
      desc: 'Real-time card attempt velocity across issuing banks',
      icon: Layers,
      category: 'Risk',
    },
    {
      id: 'geo_distribution',
      title: 'Geographic Volume',
      desc: 'Regional currency split and local payment rail adoption',
      icon: PieChart,
      category: 'Payments',
    },
    {
      id: 'mrr_cohorts',
      title: 'Cohort MRR Expansion',
      desc: '30/60/90-day retention curve across merchant cohorts',
      icon: BarChart2,
      category: 'Growth',
    },
  ];

  const handleToggle = (id: string) => {
    if (selectedWidgets.includes(id)) {
      setSelectedWidgets(selectedWidgets.filter((w) => w !== id));
    } else {
      setSelectedWidgets([...selectedWidgets, id]);
    }
  };

  const handleApply = () => {
    selectedWidgets.forEach((w) => onAdd(w));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-black/[0.08] max-w-lg w-full p-6 relative animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-black/[0.06]">
          <div>
            <h3 className="text-xl font-bold text-[#111111] tracking-tight">Add Analytics Widget</h3>
            <p className="text-xs text-[#737373] mt-0.5">Customize your overview dashboard metrics</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-black/[0.05] flex items-center justify-center text-[#777777] hover:text-[#111111]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-2.5 max-h-[380px] overflow-y-auto">
          {availableWidgets.map((item) => {
            const Icon = item.icon;
            const isSelected = selectedWidgets.includes(item.id);

            return (
              <div
                key={item.id}
                onClick={() => handleToggle(item.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                    : 'border-black/[0.06] hover:bg-black/[0.02]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSelected ? 'bg-blue-600 text-white' : 'bg-black/[0.04] text-[#444444]'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#111111] flex items-center gap-2">
                      {item.title}
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-black/[0.05] text-[#666666]">
                        {item.category}
                      </span>
                    </div>
                    <div className="text-xs text-[#737373] mt-0.5">{item.desc}</div>
                  </div>
                </div>

                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-black/20'}`}>
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-black/[0.06]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#666666] hover:text-[#111111] rounded-xl hover:bg-black/[0.04]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={selectedWidgets.length === 0}
            className="px-5 py-2 text-xs font-semibold bg-[#222222] hover:bg-black text-white rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Add Selected ({selectedWidgets.length})
          </button>
        </div>
      </div>
    </div>
  );
};
