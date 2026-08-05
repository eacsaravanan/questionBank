import React, { useEffect, useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';

export default function ContentManagement() {
  const toast = useToast();
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [newExam, setNewExam] = useState({ code: '', name: '' });
  const [newSubject, setNewSubject] = useState('');
  const [creatingExam, setCreatingExam] = useState(false);
  const [creatingSubject, setCreatingSubject] = useState(false);

  // Derived, always in sync with the latest `exams` fetch — this is what
  // fixes "adding a subject doesn't show up": previously the selected exam
  // was stored as a snapshot object that went stale after a reload.
  const selectedExam = exams.find((e) => e.id === selectedExamId) || null;

  async function load() {
    const { data } = await api.get('/content/exams');
    setExams(data);
  }
  useEffect(() => { load().catch((err) => toast.error(apiErrorMessage(err, 'Could not load exams.'))); }, []); // eslint-disable-line

  async function createExam(e) {
    e.preventDefault();
    if (!newExam.code.trim() || !newExam.name.trim()) {
      toast.warning('Both a code and a full name are required.');
      return;
    }
    setCreatingExam(true);
    try {
      await api.post('/content/exams', { code: newExam.code.trim(), name: newExam.name.trim() });
      setNewExam({ code: '', name: '' });
      await load();
      toast.success(`Exam "${newExam.name.trim()}" created.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not create the exam.'));
    } finally {
      setCreatingExam(false);
    }
  }

  async function createSubject(e) {
    e.preventDefault();
    if (!selectedExam) {
      toast.warning('Select an exam first.');
      return;
    }
    if (!newSubject.trim()) {
      toast.warning('Enter a subject name.');
      return;
    }
    setCreatingSubject(true);
    try {
      await api.post('/content/subjects', { examId: selectedExam.id, name: newSubject.trim() });
      const savedName = newSubject.trim();
      setNewSubject('');
      await load();
      toast.success(`Subject "${savedName}" added to ${selectedExam.name}.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not create the subject.'));
    } finally {
      setCreatingSubject(false);
    }
  }

  return (
    <AppShell title="Super Admin" navItems={NAV}>
      <PageHeader eyebrow="Content Hierarchy" title="Exams & subjects" />

      <div className="px-8 pb-12 grid grid-cols-3 gap-6">
        <Card className="p-6 col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={16} className="text-verdant-600" />
            <h2 className="font-display font-semibold text-ink-900 text-sm">Exams</h2>
          </div>
          <ul className="space-y-1.5 mb-4">
            {exams.map((ex) => (
              <li key={ex.id}>
                <button
                  onClick={() => setSelectedExamId(ex.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                    selectedExamId === ex.id ? 'border-gold-500 bg-gold-500/5' : 'border-ink-900/10'
                  }`}
                >
                  <span className="font-mono text-xs text-ink-900/40 mr-2">{ex.code}</span>{ex.name}
                  <span className="text-xs text-ink-900/40 ml-2">({ex.subjects?.length || 0} subjects)</span>
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={createExam} className="space-y-2 pt-3 border-t border-ink-900/8">
            <input required placeholder="Code e.g. TNPSC" className="w-full px-3 py-1.5 rounded-lg border border-ink-900/15 text-sm"
              value={newExam.code} onChange={(e) => setNewExam((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            <input required placeholder="Full name" className="w-full px-3 py-1.5 rounded-lg border border-ink-900/15 text-sm"
              value={newExam.name} onChange={(e) => setNewExam((f) => ({ ...f, name: e.target.value }))} />
            <Button variant="ghost" className="w-full" disabled={creatingExam}>
              <span className="flex items-center justify-center gap-1.5"><Plus size={14}/> {creatingExam ? 'Adding…' : 'Add exam'}</span>
            </Button>
          </form>
        </Card>

        <Card className="p-6 col-span-2">
          <h2 className="font-display font-semibold text-ink-900 text-sm mb-4">
            {selectedExam ? `Subjects for ${selectedExam.name}` : 'Select an exam to manage its subjects'}
          </h2>
          {selectedExam && (
            <>
              <ul className="grid grid-cols-2 gap-2 mb-4">
                {selectedExam.subjects?.length === 0 && (
                  <li className="text-sm text-ink-900/40 col-span-2">No subjects yet — add the first one below.</li>
                )}
                {selectedExam.subjects?.map((s) => (
                  <li key={s.id} className="px-3 py-2 rounded-lg border border-ink-900/10 text-sm">{s.name}</li>
                ))}
              </ul>
              <form onSubmit={createSubject} className="flex gap-2">
                <input placeholder="New subject name (e.g. Indian Polity)" className="flex-1 px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
                <Button variant="primary" disabled={creatingSubject}>{creatingSubject ? 'Adding…' : 'Add subject'}</Button>
              </form>
              <p className="text-xs text-ink-900/40 mt-3">
                Units, chapters, topics and subtopics can be added the same way once a subject is created —
                the hierarchy has no fixed limit at any level.
              </p>
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
