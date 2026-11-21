import { Clock, Coffee, Cookie, Moon, Utensils } from 'lucide-react';
import { MEALS } from '../../utils/messMenus.js';

const ICONS = { breakfast: Coffee, lunch: Utensils, eveningSnacks: Cookie, dinner: Moon };

export default function MenuCards({ menu }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {MEALS.map(({ key, label }) => {
      const meal = menu?.meals?.[key], Icon = ICONS[key];
      return <article key={key} aria-label={label} className="card min-w-0 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-navy-50/60 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600"><Icon size={21} aria-hidden="true" /></span>
          <h3 className="font-bold text-navy-900">{label}</h3>
        </div>
        <div className="space-y-4 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-slate-500"><Clock size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{meal?.servingTime ? meal.servingTime.replace('-', ' – ') : 'Time to be announced'}</span></p>
          {meal?.items?.length ? <ul className="space-y-2">{meal.items.map((item, index) => <li key={index} className="flex items-start gap-2 break-words text-slate-800"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" aria-hidden="true" /><span className="min-w-0 break-words">{item}</span></li>)}</ul>
            : <p className="text-sm text-slate-500">No food items announced yet.</p>}
          {meal?.notes && <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{meal.notes}</p>}
        </div>
      </article>;
    })}
  </div>;
}
