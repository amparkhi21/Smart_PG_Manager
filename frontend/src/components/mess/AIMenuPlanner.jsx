import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import api from '../../api/client.js';
import Modal from '../ui/Modal.jsx';
import { Field, Input, Select, Textarea } from '../ui/FormControls.jsx';
import { MEALS } from '../../utils/messMenus.js';
import { formatDate, getErrorMessage, todayInput } from '../../utils/format.js';

const asMenuMeal = (meal) => ({ items: meal.items, notes: [meal.explanation, meal.ingredientNotes].filter(Boolean).join('\n') });

export default function AIMenuPlanner({ initialDate, onClose, onApply, applying }) {
  const [mode, setMode] = useState('daily');
  const [form, setForm] = useState({ date: initialDate, days: '7', meal: 'breakfast', diet: 'vegetarian', preference: 'healthy', budget: '', prompt: '' });
  const [result, setResult] = useState(null), [generatedFor, setGeneratedFor] = useState(null);
  const [selected, setSelected] = useState([]), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const lock = useRef(false), request = useRef(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  const set = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const generate = async (replacement) => {
    if (lock.current || applying) return;
    const input = replacement ? { ...generatedFor, mode: 'meal', date: replacement.date, meal: replacement.meal,
      avoid: (result.days ? result.days.flatMap((day) => Object.values(day.meals).flatMap((meal) => meal.items)) : result.suggestions.flatMap((meal) => meal.items)).slice(0, 60) }
      : { mode, date: form.date, days: Number(form.days), meal: form.meal, diet: form.diet, preference: form.preference,
        prompt: form.prompt, ...(form.budget !== '' && { budget: Number(form.budget) }) };
    lock.current = true; const controller = new AbortController(); request.current = controller;
    setBusy(replacement ? `${replacement.date}:${replacement.meal}:${replacement.index ?? ''}` : 'generate'); setError('');
    try {
      const response = await api.post('/mess-menus/ai/plan', input, { signal: controller.signal, timeout: 55000 });
      if (!alive.current) return;
      const data = response.data.data;
      if (replacement) {
        setResult((current) => current.days ? { ...current, warnings: [...new Set([...current.warnings, ...data.warnings])], days: current.days.map((day) => day.date === replacement.date ? { ...day, meals: { ...day.meals, [replacement.meal]: data.suggestions[0] } } : day) }
          : { ...current, warnings: [...new Set([...current.warnings, ...data.warnings])], suggestions: current.suggestions.map((meal, index) => index === replacement.index ? data.suggestions[0] : meal) });
      } else { setResult(data); setGeneratedFor(input); setSelected([]); }
    } catch (err) { if (alive.current && !controller.signal.aborted) setError(getErrorMessage(err)); }
    finally { lock.current = false; if (alive.current) setBusy(''); }
  };
  const apply = async (days) => {
    if (lock.current || applying) return;
    if (!weeklyComplete) return setError('Complete all four meals for every planned day before reviewing menus to save.');
    setError('');
    try { await onApply(days); } catch (err) { if (alive.current) setError(getErrorMessage(err)); }
  };
  const changeMeal = (date, key, value) => setResult((current) => ({ ...current, days: current.days.map((day) => day.date === date ? { ...day, meals: { ...day.meals, [key]: { ...day.meals[key], items: value.split('\n') } } } : day) }));
  const disabled = Boolean(busy) || applying;
  const weeklyComplete = !result?.days || (result.days.length === generatedFor?.days && result.days.every((day, index) =>
    day.date === new Date(Date.parse(`${generatedFor.date}T12:00:00Z`) + index * 86400000).toISOString().slice(0, 10)
    && MEALS.every(({ key }) => Array.isArray(day.meals?.[key]?.items) && day.meals[key].items.some((item) => item.trim())
      && day.meals[key].items.every((item) => item.length <= 120))));
  return <Modal title="AI Menu Planner" size="lg" onClose={onClose} dismissable={!applying}>
    <div className="space-y-5">
      <p className="text-sm text-slate-600">Generate ideas, review and edit, then confirm Save in the existing menu editor. Nothing is published automatically.</p>
      <div role="tablist" aria-label="Planner mode" className="flex rounded-xl bg-slate-100 p-1">{[['daily', 'Daily Ideas'], ['weekly', 'Weekly Planner']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mode === value} disabled={disabled} className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold ${mode === value ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500'}`} onClick={() => { setMode(value); setResult(null); setError(''); }}>{label}</button>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); generate(); }} className="space-y-4">
        <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label={mode === 'daily' ? 'Target menu date' : 'Start date'} htmlFor="ai-date"><Input id="ai-date" name="date" type="date" required min={todayInput()} max={new Date(Date.parse(`${todayInput()}T12:00:00Z`) + 365 * 86400000).toISOString().slice(0, 10)} value={form.date} onChange={set} /></Field>
          {mode === 'daily' ? <Field label="Meal" htmlFor="ai-meal"><Select id="ai-meal" name="meal" value={form.meal} onChange={set}>{MEALS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</Select></Field>
            : <Field label="Duration" htmlFor="ai-days"><Select id="ai-days" name="days" value={form.days} onChange={set}><option value="3">3 days</option><option value="7">7 days</option></Select></Field>}
          <Field label="Food type" htmlFor="ai-diet"><Select id="ai-diet" name="diet" value={form.diet} onChange={set}><option value="vegetarian">Vegetarian Only</option><option value="nonVegetarian">Non-Veg Allowed</option></Select></Field>
          <Field label="Preference" htmlFor="ai-preference"><Select id="ai-preference" name="preference" value={form.preference} onChange={set}><option value="healthy">Healthy</option><option value="budget">Budget Friendly</option><option value="highProtein">High Protein</option></Select></Field>
          <Field label="Per-person budget (₹, optional)" htmlFor="ai-budget" hint={mode === 'weekly' ? 'Approximate budget per person per day.' : 'Approximate budget per person for this meal.'}><Input id="ai-budget" name="budget" type="number" min="1" max="2000" step="any" value={form.budget} onChange={set} /></Field>
          <div className="sm:col-span-2"><Field label="Custom instructions" htmlFor="ai-prompt" hint="Hindi, English or Hinglish. Include dishes to avoid; do not include personal details."><Textarea id="ai-prompt" name="prompt" maxLength={1500} value={form.prompt} onChange={set} placeholder="Kal breakfast mein kuch healthy suggest karo. Poha mat dena." rows={3} /></Field></div>
        </fieldset>
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={disabled}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{busy ? 'Generating…' : result ? 'Regenerate ideas' : 'Generate ideas'}</button>
      </form>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error} Try again with Generate or Regenerate.</p>}
      {busy && <p role="status" className="text-sm text-slate-500">Preparing practical meal ideas. This can take a few moments.</p>}
      {result && <section aria-label="AI menu preview" className="space-y-4">
        <h3 className="font-bold text-navy-900">Review {result.days ? `${result.days.length} days` : MEALS.find((meal) => meal.key === generatedFor.meal)?.label} · {formatDate(generatedFor.date)}</h3>
        <p className="text-sm text-slate-500">Recent saved dishes inform variety. Strict non-repetition and exact local prices cannot be guaranteed.</p>
        {result.warnings.map((warning, index) => <p key={index} role="status" className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">{warning}</p>)}
        {result.suggestions?.map((meal, index) => <article key={index} aria-label={`Suggestion ${index + 1}`} className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <h4 className="break-words font-bold text-navy-900">{meal.items.join(' · ')}</h4><p className="text-sm text-slate-600">{meal.explanation}</p>{meal.ingredientNotes && <p className="text-sm text-slate-500">Ingredients: {meal.ingredientNotes}</p>}
          <div className="flex flex-wrap gap-2"><button type="button" disabled={disabled} className="btn-secondary" aria-label={`Regenerate suggestion ${index + 1}`} onClick={() => generate({ date: generatedFor.date, meal: generatedFor.meal, index })}><RefreshCw size={16} />Regenerate</button>
            <button type="button" disabled={disabled} className="btn-primary" onClick={() => apply([{ date: generatedFor.date, meals: { [generatedFor.meal]: asMenuMeal(meal) } }])}>Use This Menu</button></div>
        </article>)}
        {result.days?.map((day) => <article key={day.date} aria-label={`Menu ${day.date}`} className="space-y-4 rounded-2xl border border-slate-200 p-4">
          <label className="flex min-h-11 items-center gap-3 font-bold text-navy-900"><input type="checkbox" className="h-5 w-5 accent-teal-600" disabled={disabled} checked={selected.includes(day.date)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, day.date] : current.filter((date) => date !== day.date))} />Select {formatDate(day.date)}</label>
          <div className="grid gap-4 sm:grid-cols-2">{MEALS.map(({ key, label }) => <div key={key} className="min-w-0 space-y-2"><Field label={label} htmlFor={`ai-${day.date}-${key}`} hint="One food item per line."><Textarea id={`ai-${day.date}-${key}`} disabled={disabled} value={day.meals[key].items.join('\n')} onChange={(event) => changeMeal(day.date, key, event.target.value)} /></Field>
            <button type="button" className="btn-secondary" disabled={disabled} aria-label={`Regenerate ${label} for ${day.date}`} onClick={() => generate({ date: day.date, meal: key })}><RefreshCw size={15} />Regenerate {label}</button></div>)}</div>
        </article>)}
        {result.days && !weeklyComplete && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Complete all four meals for every planned day before reviewing menus to save.</p>}
        {result.days && <button type="button" disabled={disabled || !selected.length || !weeklyComplete} className="btn-primary w-full" onClick={() => apply(result.days.filter((day) => selected.includes(day.date)).map((day) => ({ date: day.date, meals: Object.fromEntries(MEALS.map(({ key }) => [key, asMenuMeal(day.meals[key])])) })))}>Review selected days ({selected.length})</button>}
      </section>}
    </div>
  </Modal>;
}
