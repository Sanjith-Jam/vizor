import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type { SosContact } from "../types";
import {
  ShieldAlert,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Phone,
  User as UserIcon,
  AlertCircle,
} from "lucide-react";

export const SosContactsManager: React.FC = () => {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<SosContact[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // New Contact form state
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const storageKey = user
    ? `vizor_sos_contacts_${user.id}`
    : "vizor_sos_contacts_default";

  // Load contacts
  useEffect(() => {
    if (!user) return;
    loadContacts();
  }, [user]);

  const loadContacts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("sos_contacts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        setError(error.message);
      } else {
        setContacts(data || []);
      }
    } else {
      // Demo mode from localStorage
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        try {
          setContacts(JSON.parse(cached));
        } catch {
          setContacts([]);
        }
      } else {
        // Provide sample starter contact in demo
        const defaultSample: SosContact[] = [
          {
            id: "sample-1",
            user_id: user.id,
            name: "Emergency Contact (Mom)",
            phone: "+91 98765 43210",
            created_at: new Date().toISOString(),
          },
        ];
        localStorage.setItem(storageKey, JSON.stringify(defaultSample));
        setContacts(defaultSample);
      }
    }
    setLoading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (contacts.length >= 3) {
      setError(
        "Maximum 3 emergency contacts allowed for the firmware broadcast queue.",
      );
      return;
    }
    if (!newName.trim() || !newPhone.trim()) {
      setError("Please provide both contact name and phone number.");
      return;
    }

    setSubmitting(true);
    setError(null);

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("sos_contacts")
        .insert([
          {
            user_id: user.id,
            name: newName.trim(),
            phone: newPhone.trim(),
          },
        ])
        .select();

      if (error) {
        setError(error.message);
      } else if (data) {
        setContacts([...contacts, ...data]);
        setNewName("");
        setNewPhone("");
        setIsAdding(false);
      }
    } else {
      // Demo save
      const newContact: SosContact = {
        id: "contact-" + Date.now(),
        user_id: user.id,
        name: newName.trim(),
        phone: newPhone.trim(),
        created_at: new Date().toISOString(),
      };
      const updated = [...contacts, newContact];
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setContacts(updated);
      setNewName("");
      setNewPhone("");
      setIsAdding(false);
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    setError(null);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("sos_contacts")
        .delete()
        .eq("id", id);

      if (error) {
        setError(error.message);
        return;
      }
    }
    const updated = contacts.filter((c) => c.id !== id);
    setContacts(updated);
    if (!isSupabaseConfigured) {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    }
  };

  const startEdit = (contact: SosContact) => {
    setEditingId(contact.id);
    setEditName(contact.name);
    setEditPhone(contact.phone);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim() || !editPhone.trim()) return;

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("sos_contacts")
        .update({ name: editName.trim(), phone: editPhone.trim() })
        .eq("id", id);

      if (error) {
        setError(error.message);
        return;
      }
    }

    const updated = contacts.map((c) =>
      c.id === id
        ? { ...c, name: editName.trim(), phone: editPhone.trim() }
        : c,
    );
    setContacts(updated);
    if (!isSupabaseConfigured) {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    }
    setEditingId(null);
  };

  return (
    <div className="sos-manager hud-card rounded-2xl p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-hud-border">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-hud-hazard" />
            <h3 className="font-heading font-semibold text-lg text-hud-text">
              Emergency SOS Contacts
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface border border-hud-border text-hud-muted">
              {contacts.length} / 3 slots
            </span>
          </div>
          <p className="text-xs text-hud-muted mt-1">
            Private contacts saved to this account. Add them on the phone for
            its crash countdown and call/message prompts.
          </p>
        </div>

        {!isAdding && contacts.length < 3 && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-hud-primary/10 border border-hud-primary/40 text-hud-primary text-xs font-semibold hover:bg-hud-primary hover:text-background transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-xl bg-hud-hazard/10 border border-hud-hazard/30 flex items-center gap-2 text-xs text-hud-hazard">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Add Contact Form */}
      {isAdding && (
        <form
          onSubmit={handleAdd}
          className="mt-6 p-4 rounded-xl bg-surface/80 border border-hud-primary/30 space-y-4 animate-in fade-in duration-150"
        >
          <div className="text-xs font-mono text-hud-primary uppercase tracking-wider">
            Register New Emergency Contact
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hud-muted mb-1">
                Contact Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3 top-2.5 text-hud-muted" />
                <input
                  type="text"
                  placeholder="e.g. Partner, Parent, Dispatcher"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-hud-border text-xs text-hud-text focus:outline-none focus:border-hud-primary"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-hud-muted mb-1">
                Phone Number (with country code)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-2.5 text-hud-muted" />
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-hud-border text-xs text-hud-text focus:outline-none focus:border-hud-primary"
                  required
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setError(null);
              }}
              className="px-3 py-1.5 rounded-lg border border-hud-border text-xs text-hud-muted hover:text-hud-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-hud-primary text-background font-semibold text-xs hover:bg-hud-primary/90 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Contact"}
            </button>
          </div>
        </form>
      )}

      {/* Contacts List */}
      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="py-8 text-center text-xs font-mono text-hud-muted animate-pulse">
            Querying emergency contact registry...
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-hud-border/70 rounded-xl p-6">
            <p className="text-sm text-hud-muted">
              No emergency contacts registered yet.
            </p>
            <p className="text-xs text-hud-muted/70 mt-1">
              Add at least one contact so the helmet firmware can dispatch crash
              coordinates.
            </p>
          </div>
        ) : (
          contacts.map((contact, index) => (
            <div
              key={contact.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-surface/50 border border-hud-border hover:border-hud-borderHighlight gap-3 transition-colors"
            >
              {editingId === contact.id ? (
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-background border border-hud-border text-xs text-hud-text focus:border-hud-primary outline-none"
                  />
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-background border border-hud-border text-xs text-hud-text focus:border-hud-primary outline-none"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-hud-hazard/10 border border-hud-hazard/30 flex items-center justify-center text-hud-hazard text-xs font-mono font-bold">
                    #{index + 1}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-hud-text">
                      {contact.name}
                    </h4>
                    <p className="text-xs font-mono text-hud-muted flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 text-hud-primary" />
                      {contact.phone}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 self-end sm:self-center">
                {editingId === contact.id ? (
                  <>
                    <button
                      onClick={() => handleSaveEdit(contact.id)}
                      className="p-3 rounded-lg bg-hud-safe/20 text-hud-safe hover:bg-hud-safe/30"
                      title="Save"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-3 rounded-lg bg-surface border border-hud-border text-hud-muted hover:text-hud-text"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(contact)}
                      className="p-3 rounded-lg text-hud-muted hover:text-hud-primary hover:bg-surface"
                      title="Edit Contact"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(contact.id)}
                      className="p-3 rounded-lg text-hud-muted hover:text-hud-hazard hover:bg-surface"
                      title="Delete Contact"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {contacts.length >= 3 && !isAdding && (
        <div className="mt-4 text-[11px] font-mono text-hud-muted/70 text-center">
          Up to 3 emergency contacts.
        </div>
      )}
    </div>
  );
};
