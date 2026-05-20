import type { MindMapNode } from '../../shared/MindMap';

/**
 * Rich AI-generated lesson shape. `lesson_data` JSONB column stores the whole object.
 * All inner fields are optional so the UI gracefully degrades for partial output.
 */
export interface Infographic {
  title?: string;
  caption?: string;
  /** English prompt → pollinations.ai renders a real AI-generated image. */
  imagePrompt?: string;
  /** Fallback: SVG markup (used when AI returns a diagram instead of a photo). */
  svg?: string;
}

export interface RichLessonData {
  title?: string;
  objectives?: string[];
  summary?: string;
  concepts?: Array<{ term: string; definition: string }>;
  mindMap?: MindMapNode;
  infographics?: Infographic[];
  quiz?: Array<{ question: string; options: string[]; correctIndex: number; explanation?: string }>;
  flashcards?: Array<{ front: string; back: string } | string>;
  faq?: Array<{ question: string; answer: string }>;
  examples?: string[];
  keyStats?: Array<{ label: string; value: string }>;
  furtherReading?: string[];
  // Legacy — keeps old drafts renderable
  quizLegacy?: string[];
  flashcardsLegacy?: string[];
}

export interface SavedLesson {
  id: string;
  title: string;
  date: string;
  status: 'draft' | 'published';
  data: RichLessonData;
  expanded: boolean;
}

export type LessonTab = 'overview' | 'content' | 'quiz' | 'resources';
