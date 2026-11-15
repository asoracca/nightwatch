import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import Home from '../app/page';
import {FrameViewer} from '../components/FrameViewer';
import {supabase} from '../lib/client';
vi.mock('../lib/client',async importOriginal=>{
  const original=await importOriginal<typeof import('../lib/client')>();
  return {...original,supabase:vi.fn()};
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('shows session loading without inventing videos',()=>{
  vi.mocked(supabase).mockReturnValue({auth:{getSession:()=>new Promise(()=>{}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}} as unknown as ReturnType<typeof supabase>);
  render(<Home/>);expect(screen.getByRole('status')).toHaveTextContent('Loading session');
});
it('shows missing configuration error',()=>{
  vi.mocked(supabase).mockImplementation(()=>{throw new Error('Configure Supabase');});
  render(<Home/>);expect(screen.getByRole('alert')).toHaveTextContent('Configure Supabase');
});
it('does not describe no detections as proof of an empty scene',()=>{
  render(<FrameViewer confidence={.4} frame={{id:'test',frame_number:0,timestamp_seconds:0,image_url:'/fixture.jpg',visibility_condition:'clear',detections_json:[],review_required:false,review_reason:null,review_status:'pending',model_version:'unit-test-only'}}/>);
  expect(screen.getByText(/does not establish/)).toBeInTheDocument();
});
