"""LangChain explanation layer, deliberately deterministic; no model-generated facts."""
def report(video, investigation, frames, topic):
    from langchain_core.runnables import RunnableLambda
    def render(_):
        citations = [{'video_id':video['id'],'frame_id':f['id'],'frame_number':f['frame_number'],
                      'timestamp_seconds':f['timestamp_seconds'],'condition':f['visibility_condition'],
                      'model_name':f['model_name'],'model_version':f['model_version'],
                      'stored_review_reason':f['review_reason'], 'stored_detections':f['detections_json']} for f in frames]
        return {'topic':topic,'text':investigation['summary'],
                'evidence':{'video_id':video['id'],'job_id':investigation['job_id'],'investigation_id':investigation['id'],
                            'model_name':video['model_name'],'model_version':video['model_version'],
                            'total_frames':investigation['total_frames'],'total_detections':investigation['total_detections'],
                            'average_confidence':investigation['average_confidence'],'miss_rate':investigation['miss_rate'],
                            'stored_metrics':investigation['metrics_json']},
                'flagged_frame_citations':citations,'citation_scope':'First 10 flagged condition-frames only. Aggregate evidence covers the complete job.',
                'limitations':'No ground-truth miss rate or independently inferred affected use case. No emergency advice.'}
    return RunnableLambda(render).invoke({})
