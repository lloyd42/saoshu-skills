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

## 对比维度建议
- author（作者）
- tags（标签拆分后聚合）
- verdict（可看/慎入/劝退）
- pipeline_mode（economy/performance）
- target_defense（目标防御）
- title（按作品聚合）
