"use client";

import { useEffect, useState, useCallback } from "react";
import { Pencil, Trash2, Plus, Briefcase, Clock, X } from "lucide-react";
import {
  listServices,
  createService,
  updateService,
  deleteService,
  listServiceDurations,
  createServiceDuration,
  updateServiceDuration,
  deleteServiceDuration,
} from "@/lib/api";
import Modal from "@/components/modal";

interface ServiceForm {
  Name: string;
  BufferBeforeMinutes: number;
  BufferAfterMinutes: number;
  DefaultCapacity: number;
  Category: string;
}

interface DurationRow {
  key: string;
  /** persisted id when editing */
  id?: string;
  duration_minutes: number;
  price_cents: number;
}

const EMPTY_FORM: ServiceForm = {
  Name: "",
  BufferBeforeMinutes: 0,
  BufferAfterMinutes: 0,
  DefaultCapacity: 1,
  Category: "Default",
};

function newRow(over?: Partial<DurationRow>): DurationRow {
  return {
    key: crypto.randomUUID(),
    duration_minutes: 30,
    price_cents: 0,
    ...over,
  };
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function centsToDollars(cents: number): string {
  if (cents <= 0) return "";
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export default function ServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [durationRows, setDurationRows] = useState<DurationRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [priceEditKey, setPriceEditKey] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");

  const fetchServices = async () => {
    try {
      const data = await listServices();
      setServices((data ?? []).filter((s: any) => s.is_active));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDurationRows([newRow()]);
    setPriceEditKey(null);
    setModalOpen(true);
  };

  const openEdit = async (svc: any) => {
    setEditing(svc);
    setForm({
      Name: svc.name,
      BufferBeforeMinutes: svc.buffer_before_minutes ?? 0,
      BufferAfterMinutes: svc.buffer_after_minutes ?? 0,
      DefaultCapacity: svc.default_capacity ?? 1,
      Category: "Default",
    });
    setPriceEditKey(null);
    setModalOpen(true);
    try {
      const res = await listServiceDurations(svc.id);
      const list = res ?? [];
      if (list.length > 0) {
        setDurationRows(
          list.map((d: any) =>
            newRow({
              key: d.id,
              id: d.id,
              duration_minutes: d.duration_minutes,
              price_cents:
                typeof d.price_cents === "number" ? d.price_cents : 0,
            })
          )
        );
      } else {
        setDurationRows([
          newRow({ duration_minutes: svc.duration_minutes ?? 30, price_cents: 0 }),
        ]);
      }
    } catch {
      setDurationRows([
        newRow({ duration_minutes: svc.duration_minutes ?? 30, price_cents: 0 }),
      ]);
    }
  };

  const updateRow = useCallback((key: string, patch: Partial<DurationRow>) => {
    setDurationRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  }, []);

  const addRow = () => {
    setDurationRows((rows) => [...rows, newRow()]);
  };

  const removeRow = (key: string) => {
    setDurationRows((rows) => {
      if (rows.length <= 1) return rows;
      return rows.filter((r) => r.key !== key);
    });
    if (priceEditKey === key) setPriceEditKey(null);
  };

  const syncDurationsForService = async (
    serviceId: string,
    rows: DurationRow[],
    previousIds: string[]
  ) => {
    const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
    for (const oldId of previousIds) {
      if (!keptIds.has(oldId)) {
        await deleteServiceDuration(oldId);
      }
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.id) {
        await updateServiceDuration(row.id, {
          duration_minutes: row.duration_minutes,
          price_cents: row.price_cents,
          is_active: true,
        });
      } else {
        await createServiceDuration(serviceId, {
          duration_minutes: row.duration_minutes,
          price_cents: row.price_cents,
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rows = durationRows.filter((r) => r.duration_minutes >= 5);
    if (rows.length === 0) {
      alert("Add at least one duration (5 minutes or more).");
      return;
    }
    const seen = new Set<number>();
    for (const r of rows) {
      if (seen.has(r.duration_minutes)) {
        alert("Each duration length should be unique.");
        return;
      }
      seen.add(r.duration_minutes);
    }

    const firstMinutes = rows[0].duration_minutes;
    setSaving(true);
    try {
      if (editing) {
        const prev = await listServiceDurations(editing.id);
        const prevIds = (prev ?? []).map((d: any) => d.id);
        await updateService(editing.id, {
          Name: form.Name,
          DurationMinutes: firstMinutes,
          BufferBeforeMinutes: form.BufferBeforeMinutes,
          BufferAfterMinutes: form.BufferAfterMinutes,
          DefaultCapacity: form.DefaultCapacity,
          IsActive: editing.is_active,
        });
        await syncDurationsForService(editing.id, rows, prevIds);
      } else {
        const created = await createService({
          Name: form.Name,
          DurationMinutes: firstMinutes,
          BufferBeforeMinutes: form.BufferBeforeMinutes,
          BufferAfterMinutes: form.BufferAfterMinutes,
          DefaultCapacity: form.DefaultCapacity,
        });
        const sid = created.id;
        for (let i = 0; i < rows.length; i++) {
          await createServiceDuration(sid, {
            duration_minutes: rows[i].duration_minutes,
            price_cents: rows[i].price_cents,
          });
        }
      }
      setModalOpen(false);
      setLoading(true);
      await fetchServices();
    } catch (err: any) {
      alert(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (svc: any) => {
    if (!confirm(`Delete "${svc.name}"?`)) return;
    await deleteService(svc.id);
    setLoading(true);
    await fetchServices();
  };

  const startPriceEdit = (row: DurationRow) => {
    setPriceEditKey(row.key);
    setPriceDraft(row.price_cents > 0 ? centsToDollars(row.price_cents) : "");
  };

  const commitPriceEdit = (row: DurationRow) => {
    const cents = priceDraft.trim() === "" ? 0 : parseDollarsToCents(priceDraft);
    updateRow(row.key, { price_cents: Math.max(0, cents) });
    setPriceEditKey(null);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Services</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure appointment types, durations and pricing
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <Plus className="w-4 h-4" />
          Add Service
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
            <Briefcase className="w-6 h-6 text-indigo-400" />
          </div>
          <p className="text-gray-900 font-medium mb-1">No services yet</p>
          <p className="text-gray-500 text-sm mb-6">
            Create your first service to define appointment types.
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Service
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {services.map((svc) => (
            <div
              key={svc.id}
              className="bg-white rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-md transition-all duration-200 p-5 group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-900">
                    {svc.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Default {svc.duration_minutes} min
                    </span>
                    <span>
                      Buffer: {svc.buffer_before_minutes ?? 0}m /{" "}
                      {svc.buffer_after_minutes ?? 0}m
                    </span>
                    <span>Capacity: {svc.default_capacity ?? 1}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(svc)}
                    className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(svc)}
                    className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Update Service" : "New Service"}
        wide
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-gray-600 whitespace-nowrap">
              Category:
            </label>
            <select
              value={form.Category}
              onChange={(e) =>
                setForm({ ...form, Category: e.target.value })
              }
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 outline-none"
            >
              <option value="Default">Default</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={form.Name}
              onChange={(e) => setForm({ ...form, Name: e.target.value })}
              className="w-full text-xl font-semibold text-gray-900 border-0 border-b-2 border-gray-200 rounded-none px-0 py-2 focus:ring-0 focus:border-sky-500 outline-none bg-transparent placeholder:text-gray-300"
              placeholder="e.g. Haircut"
            />
            <button
              type="button"
              className="mt-1 text-xs text-sky-600 hover:text-sky-800 font-medium"
              onClick={() => {}}
            >
              Update Description
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Durations
            </p>
            <div className="space-y-3">
              {durationRows.map((row, index) => (
                <div
                  key={row.key}
                  className="flex items-start gap-2 sm:gap-3"
                >
                  <div className="flex-1 min-w-0 relative">
                    <label className="absolute -top-2 left-3 px-1 bg-white text-[11px] font-medium text-gray-500 z-[1]">
                      Duration
                    </label>
                    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 pt-3 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all">
                      <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <input
                        type="number"
                        min={5}
                        step={5}
                        required
                        value={row.duration_minutes}
                        onChange={(e) =>
                          updateRow(row.key, {
                            duration_minutes: Number(e.target.value) || 5,
                          })
                        }
                        className="flex-1 min-w-0 border-0 p-0 text-sm font-medium text-gray-900 focus:ring-0 outline-none"
                      />
                      <span className="text-sm text-gray-500 tabular-nums flex-shrink-0">
                        {formatDuration(row.duration_minutes)}
                      </span>
                    </div>
                  </div>

                  {priceEditKey === row.key ? (
                    <div className="flex items-center gap-1 pt-2">
                      <span className="text-xs text-gray-500">$</span>
                      <input
                        type="text"
                        autoFocus
                        value={priceDraft}
                        onChange={(e) => setPriceDraft(e.target.value)}
                        onBlur={() => commitPriceEdit(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitPriceEdit(row);
                          if (e.key === "Escape") setPriceEditKey(null);
                        }}
                        placeholder="0.00"
                        className="w-20 text-sm border border-gray-200 rounded px-2 py-1"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startPriceEdit(row)}
                      className="text-xs text-sky-600 hover:text-sky-800 font-medium whitespace-nowrap pt-3"
                    >
                      {row.price_cents > 0
                        ? `$${centsToDollars(row.price_cents)}`
                        : "Set Price"}
                    </button>
                  )}

                  <div className="flex items-center gap-0.5 pt-2 flex-shrink-0">
                    {index === 0 && (
                      <button
                        type="button"
                        onClick={addRow}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                        title="Add duration"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={durationRows.length <= 1}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Add multiple lengths (e.g. 30m, 60m, 90m). First duration is also
              the default on the service record.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buffer Before (min)
              </label>
              <input
                type="number"
                min={0}
                value={form.BufferBeforeMinutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    BufferBeforeMinutes: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buffer After (min)
              </label>
              <input
                type="number"
                min={0}
                value={form.BufferAfterMinutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    BufferAfterMinutes: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Capacity
            </label>
            <input
              type="number"
              required
              min={1}
              value={form.DefaultCapacity}
              onChange={(e) =>
                setForm({
                  ...form,
                  DefaultCapacity: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="text-sm font-semibold text-sky-600 hover:text-sky-800 tracking-wide"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition-all shadow-sm"
            >
              {saving ? "Saving…" : "SAVE"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
