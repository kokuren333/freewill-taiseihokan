export interface FieldDef {
  id: string;
  label: string;
  placeholder?: string;
  compact?: boolean;
  allowUnknown?: boolean;
}

export interface SectionDef {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
}

const schoolFields = (prefix: string): FieldDef[] => [
  { id: `${prefix}_strengths`, label: '得意だったこと' },
  { id: `${prefix}_weaknesses`, label: '苦手だったこと' },
  { id: `${prefix}_learning`, label: '学習' },
  { id: `${prefix}_friends`, label: '友人関係' },
  { id: `${prefix}_group`, label: '集団活動' },
  { id: `${prefix}_hobbies`, label: '趣味' },
  { id: `${prefix}_memories`, label: '強く記憶している出来事' },
  { id: `${prefix}_success`, label: '成功経験' },
  { id: `${prefix}_failure`, label: '失敗経験' },
];

export const detailSections: SectionDef[] = [
  {
    id: 'basic', title: '基礎情報', fields: [
      { id: 'age', label: '年齢', compact: true },
      { id: 'education', label: '学歴' },
      { id: 'career', label: '職歴' },
      { id: 'qualifications', label: '資格' },
      { id: 'skills', label: '専門能力' },
      { id: 'living', label: '現在の生活環境' },
      { id: 'finance', label: '経済状況の概略' },
      { id: 'available_time', label: '使用可能時間' },
      { id: 'geography', label: '地理的制約' },
      { id: 'other_constraints', label: 'その他の大きな制約' },
    ],
  },
  {
    id: 'childhood', title: '出生・幼少期', description: '診断は行いません。不明な項目は「不明」にできます。', fields: [
      { id: 'birth', label: '出生時について知っている情報', allowUnknown: true },
      { id: 'family', label: '家族構成', allowUnknown: true },
      { id: 'home', label: '幼少期の家庭環境', allowUnknown: true },
      { id: 'interests', label: '幼少期に強く興味を持ったもの', allowUnknown: true },
      { id: 'difficulties', label: '苦手だったこと', allowUnknown: true },
      { id: 'evaluation', label: '周囲からどのように評価されていたか', allowUnknown: true },
      { id: 'group_adaptation', label: '集団生活への適応', allowUnknown: true },
      { id: 'events', label: '大きな出来事', allowUnknown: true },
    ],
  },
  { id: 'elementary', title: '小学校', fields: schoolFields('elementary') },
  { id: 'junior_high', title: '中学校', fields: schoolFields('junior_high') },
  { id: 'high_school', title: '高校', fields: schoolFields('high_school') },
  { id: 'higher_education', title: '大学・専門教育', fields: schoolFields('higher_education') },
  {
    id: 'work', title: '就労・社会参加', fields: [
      { id: 'history', label: '職歴' }, { id: 'strengths', label: '仕事で得意だったこと' },
      { id: 'load', label: '強い負荷を感じたこと' }, { id: 'sustainable', label: '継続できた環境' },
      { id: 'unsustainable', label: '継続できなかった環境' }, { id: 'relations', label: '人間関係' },
      { id: 'autonomy', label: '裁量' }, { id: 'evaluation', label: '評価への反応' }, { id: 'organization', label: '組織への適応' },
    ],
  },
  {
    id: 'activities', title: '興味・活動歴', description: '時系列で記載してください。継続期間や成果は分かる場合のみで構いません。', fields: [
      { id: 'timeline', label: '趣味・制作・学習・研究・仕事・プロジェクト・運動・コミュニティ等' },
    ],
  },
  {
    id: 'successes', title: '成功経験', description: '最大10件程度を目安に、1件ごとに見出しを付けて記載してください。', fields: [
      { id: 'items', label: '内容 / 時期 / 何が成功だったか / 当時の環境 / 自分が取った行動 / 成功要因' },
    ],
  },
  {
    id: 'failures', title: '失敗・中断経験', description: '最大10件程度を目安に記載してください。', fields: [
      { id: 'items', label: '内容 / 時期 / 何が起きたか / 中断理由 / 当時の環境 / 後から考える原因' },
    ],
  },
  {
    id: 'relations', title: '対人関係', fields: [
      { id: 'alone', label: '一人で行動する方が楽か' }, { id: 'group_size', label: '少人数／大人数' },
      { id: 'management', label: '管理されることへの反応' }, { id: 'competition', label: '競争' },
      { id: 'cooperation', label: '協力' }, { id: 'evaluation', label: '評価' }, { id: 'approval', label: '承認' },
      { id: 'close_relations', label: '親しい関係' }, { id: 'stress', label: '対人ストレス' },
    ],
  },
  {
    id: 'goals', title: '希望・目標候補', description: '現時点で現実的かどうかは問いません。複数記載してください。', fields: [
      { id: 'try', label: 'やってみたいこと' }, { id: 'satisfying', label: '実現できれば満足度が高いこと' },
      { id: 'career', label: '将来的な職業候補' }, { id: 'create', label: '制作したいもの' },
      { id: 'abilities', label: '得たい能力' }, { id: 'life', label: '得たい生活状態' },
      { id: 'relations', label: '人間関係上の希望' }, { id: 'social', label: '社会に対して実現したいこと' },
    ],
  },
  {
    id: 'maintenance', title: '維持したい条件', fields: [
      { id: 'income', label: '最低限必要な収入' }, { id: 'free_time', label: '自由時間' },
      { id: 'region', label: '居住地域' }, { id: 'health', label: '健康' }, { id: 'family', label: '家族との関係' },
      { id: 'qualification', label: '職業上の資格' }, { id: 'privacy', label: 'プライバシー' }, { id: 'autonomy', label: '裁量' },
    ],
  },
  {
    id: 'avoid', title: '避けたい状態', fields: [
      { id: 'interpersonal_load', label: '過度な対人負荷' }, { id: 'long_hours', label: '長時間労働' },
      { id: 'financial_instability', label: '経済的不安定' }, { id: 'monotony', label: '単調作業' },
      { id: 'strong_management', label: '強い管理' }, { id: 'no_feedback', label: '長期間成果が見えない状態' },
      { id: 'other', label: 'その他' },
    ],
  },
];
