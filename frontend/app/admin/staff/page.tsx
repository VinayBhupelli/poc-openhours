"use client";

import { useEffect, useState, useCallback } from "react";
import { listStaff, createStaff, updateStaff, deleteStaff } from "@/lib/api";
import Modal from "@/components/modal";
import { Pencil, Trash2, Plus, UserPlus } from "lucide-react";

interface StaffMember {
  id: string;
  display_name: string;
  email: string;
  is_active: boolean;
}

type Editing = null | "new" | StaffMember;

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      const data = await listStaff();
      setStaff((data ?? []).filter((s: StaffMember) => s.is_active));
    } catch (e: any) {
      showToast(e.message || "Failed to load staff", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  function openNew() {
    setFormName("");
    setFormEmail("");
    setEditing("new");
  }

  function openEdit(s: StaffMember) {
    setFormName(s.display_name);
    setFormEmail(s.email ?? "");
    setEditing(s);
  }

  function closeModal() {
    setEditing(null);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editing === "new") {
        await createStaff({ DisplayName: formName.trim(), Email: formEmail.trim() });
        showToast("Staff member created", "success");
      } else if (editing && typeof editing === "object") {
        await updateStaff(editing.id, {
          DisplayName: formName.trim(),
          Email: formEmail.trim(),
          IsActive: editing.is_active,
        });
        showToast("Staff member updated", "success");
      }
      closeModal();
      setLoading(true);
      await fetchStaff();
    } catch (e: any) {
      showToast(e.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: StaffMember) {
    if (!confirm(`Remove "${s.display_name}" from staff?`)) return;
    try {
      await deleteStaff(s.id);
      showToast("Staff member removed", "success");
      setLoading(true);
      await fetchStaff();
    } catch (e: any) {
      showToast(e.message || "Failed to delete", "error");
    }
  }

  return (
    <div className="p-8">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your team members</p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <UserPlus className="w-4 h-4" />
          Add Staff
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
            <Plus className="w-6 h-6 text-indigo-400" />
          </div>
          <p className="text-gray-900 font-medium mb-1">No staff members yet</p>
          <p className="text-gray-500 text-sm mb-6">
            Add your first staff member to get started.
          </p>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add Staff
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
                >
                  <td className="px-6 py-4 font-medium text-gray-900">{s.display_name}</td>
                  <td className="px-6 py-4 text-gray-500">{s.email || "—"}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => openEdit(s)}
                        className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={closeModal}
        title={editing === "new" ? "Add Staff Member" : "Edit Staff Member"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Display Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Jane Smith"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !formName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
