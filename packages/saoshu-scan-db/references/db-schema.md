# 扫书数据库表结构（JSONL）

## runs.jsonl
- run_id
- ingested_at
- report_generated_at
- title / author / tags
- target_defense
- verdict / rating
- batch_count
- pipeline_mode / sample_mode / sample_level
- coverage_ratio
- thunder_total / depression_total / risk_total
- input_txt / output_dir
- state_started_at / state_finished_at

## thunder_items.jsonl
- run_id / title
- rule / evidence_level / anchor / batch_id

## depression_items.jsonl
- run_id / title
- rule / severity / min_defense / evidence_level / anchor / batch_id

## risk_items.jsonl
- run_id / title
- risk / current_evidence / impact

## tag_items.jsonl
- run_id / title
- tag / count

## keyword_candidates.jsonl
- run_id / title / event_id
- rule_candidate / category
- keyword / source_kind
- review_decision / status
- subject_name / target_name
- chapter_range / chapter_num / chapter_title
- snippet

## keyword_promotions.jsonl
- promoted_at
- keyword / rule
- bucket（`thunder-risk|thunder-strict|depression|title-signal`）
- patterns[]
- title_type / weight / critical
- severity / min_defense / min_count
- note

## alias_candidates.jsonl
- run_id / title / event_id
- rule_candidate / review_decision / status
- role（`subject|target`）
- canonical_name / alias

## alias_promotions.jsonl
- promoted_at
- canonical_name / alias
- gender / role_hint / relation_label
- note

## 对比维度建议
- author（作者）
- tags（标签拆分后聚合）
- verdict（可看/慎入/劝退）
- pipeline_mode（economy/performance）
- target_defense（目标防御）
- title（按作品聚合）
