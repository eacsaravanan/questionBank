import React, { useEffect, useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';

export default function ContentManagement() {
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [newExam, setNewExam] = useState({ code: '', name: '' });
  const [newSubject, setNewSubject] = useState('');

  async function load() {
    const { data } = await api.get('/content/exams');
    setExams(data);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function createExam(e) {
    e.preventDefault();
    await api.post('/content/exams', newExam);
    setNewExam({ code: '', name: '' });
    await load();
  }

  async function createSubject(e) {
    e.preventDefault();
    if (!selectedExam || !newSubject.trim()) return;
    await api.post('/content/subjects', { examId: selectedExam.id, name: newSubject.trim() });
    setNewSubject('');
    await load();
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
                  onClick={() => setSelectedExam(ex)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                    selectedExam?.id === ex.id ? 'border-gold-500 bg-gold-500/5' : 'border-ink-900/10'
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
            <Button variant="ghost" className="w-full"><span className="flex items-center justify-center gap-1.5"><Plus size={14}/> Add exam</span></Button>
          </form>
        </Card>

        <Card className="p-6 col-span-2">
          <h2 className="font-display font-semibold text-ink-900 text-sm mb-4">
            {selectedExam ? `Subjects for ${selectedExam.name}` : 'Select an exam to manage its subjects'}
          </h2>
          {selectedExam && (
            <>
              <ul className="grid grid-cols-2 gap-2 mb-4">
                {selectedExam.subjects?.map((s) => (
                  <li key={s.id} className="px-3 py-2 rounded-lg border border-ink-900/10 text-sm">{s.name}</li>
                ))}
              </ul>
              <form onSubmit={createSubject} className="flex gap-2">
                <input placeholder="New subject name (e.g. Indian Polity)" className="flex-1 px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
                <Button variant="primary">Add subject</Button>
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
