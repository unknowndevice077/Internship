import { useState, type FormEvent } from "react";

import { fieldErrors } from "../api/client";
import { useCreateIssue, useMembers } from "../api/queries";
import type { Issue } from "../api/types";

interface Props {
  projectId: number;
  sprintId?: number | null;
  onClose(): void;
}

export default function CreateIssueModal({ projectId, sprintId = null, onClose }: Props) {
  const create = useCreateIssue();
  const { data: members = [] } = useMembers();
  const [form, setForm] = useState({ title: "", type: "task", priority: "medium", assignee: "", description: "" });
  const errors = fieldErrors(create.error);

  function submit(e: FormEvent) {
    e.preventDefault();
    const body: Partial<Issue> = {
      project: projectId,
      sprint: sprintId,
      title: form.title,
      type: form.type as Issue["type"],
      priority: form.priority as Issue["priority"],
      description: form.description,
      assignee: form.assignee ? Number(form.assignee) : null,
    };
    create.mutate(body, { onSuccess: onClose });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Create issue</h2>
        <label>
          Summary
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
          {errors.title && <span className="field-error">{errors.title}</span>}
        </label>
        <div className="row">
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="task">Task</option>
              <option value="bug">Bug</option>
              <option value="story">Story</option>
              <option value="epic">Epic</option>
            </select>
          </label>
          <label>
            Priority
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="highest">Highest</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="lowest">Lowest</option>
            </select>
          </label>
          <label>
            Assignee
            <select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.full_name || m.user.email}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        {errors.detail && <p className="form-error">{errors.detail}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={create.isPending}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
