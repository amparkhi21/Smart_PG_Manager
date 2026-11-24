import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, RefreshCw, Sparkles } from 'lucide-react';
import api from '../../api/client.js';
import Modal from '../ui/Modal.jsx';
import { Field, Input, Select, Textarea } from '../ui/FormControls.jsx';
import { MEALS } from '../../utils/messMenus.js';
import { formatDate, getErrorMessage, todayInput } from '../../utils/format.js';

const asMenuMeal = (meal) => ({ items: meal.items, notes: [meal.explanation, meal.ingredientNotes].filter(Boolean).join('\n') });
const validMeal = (meal) => Array.isArray(meal?.items) && meal.items.some((item) => item.trim()) && meal.items.every((item) => item.length <= 120);

export default function AIMenuPlanner({ initialDate, onClose, onApply, applying }) {
  const [form, setForm] = useState({ date: initialDate, meal: 'all', diet: 'vegetarian', preference: 'healthy', budget: '', prompt: '' });
  const [result, setResult] = useState(null), [generatedFor, setGeneratedFor] = useState(null);
  const [editing, setEditing] = useState([]), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const lock = useRef(false), request = useRef(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  const set = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const generate = async (replacement) => {
    if (lock.current || applying) return;
    const input = replacement ? { ...generatedFor, mode: 'meal', meal: replacement.meal,
      avoid: (result.meals ? Object.values(result.meals) : result.suggestions).flatMap((meal) => meal.items).map((item) => item.trim()).filter(Boolean).slice(0, 60) }
      : { mode: 'daily', date: form.date, meal: form.meal, diet: form.diet, preference: form.preference,
        budgetScope: form.meal === 'all' ? 'day' : 'meal', prompt: form.prompt, ...(form.budget !== '' && { budget: Number(form.budget) }) };
    lock.current = true; const controller = new AbortController(); request.current = controller;
    setBusy(replacement ? `${replacement.meal}:${replacement.index ?? ''}` : 'generate'); setError('');
    try {
      // Covers three bounded 45-second attempts and the existing 2s/4s backoff.
      const response = await api.post('/mess-menus/ai/plan', input, { signal: controller.signal, timeout: 155000 });
      if (!alive.current) return;
      const data = response.data.data;
      if (replacement) {
        setResult((current) => ({ ...current, warnings: [...new Set([...current.warnings, ...data.warnings])],
          ...(current.meals ? { meals: { ...current.meals, [replacement.meal]: data.suggestions[0] } }
            : { suggestions: current.suggestions.map((meal, index) => index === replacement.index ? data.suggestions[0] : meal) }) }));
      } else { setResult(data); setGeneratedFor(input); setEditing([]); }
    } catch (err) { if (alive.current && !controller.signal.aborted) setError(err.code === 'ECONNABORTED'
      ? 'The AI request exceeded its waiting time. Nothing was saved. Please generate again.' : getErrorMessage(err)); }
    finally { lock.current = false; if (alive.current) setBusy(''); }
  };
  const apply = async (meals) => {
    if (lock.current || applying) return;
    if (!Object.values(meals).every(validMeal)) return setError('Complete the food items before using this menu.');
    setError('');
    try { await onApply([{ date: generatedFor.date, meals: Object.fromEntries(Object.entries(meals).map(([key, meal]) => [key, asMenuMeal(meal)])) }]); }
    catch (err) { if (alive.current) setError(getErrorMessage(err)); }
  };
  const changeMeal = (key, value, index) => setResult((current) => ({ ...current,
    ...(current.meals ? { meals: { ...current.meals, [key]: { ...current.meals[key], items: value.split('\n') } } }
      : { suggestions: current.suggestions.map((meal, position) => position === index ? { ...meal, items: value.split('\n') } : meal) }) }));
  const disabled = Boolean(busy) || applying;
  const complete = !result?.meals || MEALS.every(({ key }) => validMeal(result.meals[key]));
  const cards = result?.meals ? MEALS.map(({ key, label }) => ({ key, label, meal: result.meals[key], editKey: key }))
    : (result?.suggestions || []).map((meal, index) => ({ key: generatedFor.meal, label: `Suggestion ${index + 1}`, meal, index, editKey: `suggestion-${index}` }));
  return <Modal title="AI Daily Menu Ideas" size="lg" onClose={onClose} dismissable={!applying}>
    <div className="space-y-5">
      <p className="text-sm text-slate-600">Generate ideas for one date, review and edit, then confirm Save in the menu editor. Nothing is published automatically.</p>
      <form onSubmit={(event) => { event.preventDefault(); generate(); }} className="space-y-4">
        <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label="Target menu date" htmlFor="ai-date"><Input id="ai-date" name="date" type="date" required min={todayInput()} max={new Date(Date.parse(`${todayInput()}T12:00:00Z`) + 365 * 86400000).toISOString().slice(0, 10)} value={form.date} onChange={set} /></Field>
          <Field label="Meal" htmlFor="ai-meal"><Select id="ai-meal" name="meal" value={form.meal} onChange={set}><option value="all">All Meals</option>{MEALS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</Select></Field>
          <Field label="Food type" htmlFor="ai-diet"><Select id="ai-diet" name="diet" value={form.diet} onChange={set}><option value="vegetarian">Vegetarian Only</option><option value="nonVegetarian">Non-Veg Allowed</option></Select></Field>
          <Field label="Preference" htmlFor="ai-preference"><Select id="ai-preference" name="preference" value={form.preference} onChange={set}><option value="healthy">Healthy</option><option value="budget">Budget Friendly</option><option value="highProtein">High Protein</option></Select></Field>
          <Field label={form.meal === 'all' ? 'Per-person daily budget (₹, optional)' : 'Per-person meal budget (₹, optional)'} htmlFor="ai-budget" hint={form.meal === 'all' ? 'Total for Breakfast, Lunch, Snacks and Dinner on this date.' : 'Approximate budget per person for this meal.'}><Input id="ai-budget" name="budget" type="number" min="1" max="2000" step="any" value={form.budget} onChange={set} /></Field>
          <div className="sm:col-span-2"><Field label="Custom instructions" htmlFor="ai-prompt" hint="Hindi, English or Hinglish. Include dishes to avoid; do not include personal details."><Textarea id="ai-prompt" name="prompt" maxLength={1500} value={form.prompt} onChange={set} placeholder="Kal breakfast mein kuch healthy suggest karo. Poha mat dena." rows={3} /></Field></div>
        </fieldset>
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={disabled}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{busy ? 'Generating…' : result ? 'Regenerate ideas' : 'Generate ideas'}</button>
      </form>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error} Try again with Generate or Regenerate.</p>}
      {busy && <p role="status" className="text-sm text-slate-500">Preparing practical meal ideas. This can take a few moments.</p>}
      {result && <section aria-label="AI menu preview" className="space-y-4">
        <h3 className="font-bold text-navy-900">Review {result.meals ? 'All Meals' : MEALS.find((meal) => meal.key === generatedFor.meal)?.label} · {formatDate(generatedFor.date)}</h3>
        <p className="text-sm text-slate-500">Recent saved dishes inform variety. Strict non-repetition and exact local prices cannot be guaranteed.</p>
        {result.warnings.map((warning, index) => <p key={index} role="status" className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">{warning}</p>)}
        <div className={result.meals ? 'grid gap-4 sm:grid-cols-2' : 'space-y-4'}>{cards.map(({ key, label, meal, index, editKey }) => <article key={editKey} aria-label={label} className="min-w-0 space-y-3 rounded-2xl border border-slate-200 p-4">
          <h4 className="break-words font-bold text-navy-900">{result.meals ? label : meal.items.join(' · ')}</h4>
          <Field label={`${label} food items`} htmlFor={`ai-items-${editKey}`} hint="One food item per line."><Textarea id={`ai-items-${editKey}`} disabled={disabled} readOnly={!editing.includes(editKey)} value={meal.items.join('\n')} onChange={(event) => changeMeal(key, event.target.value, index)} /></Field>
          {meal.explanation && <p className="text-sm text-slate-600">{meal.explanation}</p>}{meal.ingredientNotes && <p className="text-sm text-slate-500">Ingredients: {meal.ingredientNotes}</p>}
          <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={disabled} aria-label={`${editing.includes(editKey) ? 'Done editing' : 'Edit'} ${label}`} onClick={() => setEditing((current) => current.includes(editKey) ? current.filter((value) => value !== editKey) : [...current, editKey])}>{editing.includes(editKey) ? <Check size={16} /> : <Pencil size={16} />}{editing.includes(editKey) ? 'Done' : 'Edit'}</button>
            <button type="button" disabled={disabled} className="btn-secondary" aria-label={`Regenerate ${result.meals ? label : `suggestion ${index + 1}`}`} onClick={() => generate({ meal: key, index })}><RefreshCw size={16} />Regenerate</button>
            <button type="button" disabled={disabled || !validMeal(meal)} className="btn-primary" onClick={() => apply({ [key]: meal })}>Use This Menu</button></div>
        </article>)}</div>
        {result.meals && !complete && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Complete all four meals before using All Meals.</p>}
        {result.meals && <button type="button" disabled={disabled || !complete} className="btn-primary w-full" onClick={() => apply(result.meals)}>Use All Meals</button>}
      </section>}
    </div>
  </Modal>;
}
