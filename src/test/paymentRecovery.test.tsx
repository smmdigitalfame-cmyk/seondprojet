import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({login:vi.fn()}));
vi.mock('../lib/auth',()=>({validateAndLogin:mocks.login}));
vi.mock('../lib/telegram',()=>({getTelegramChatId:()=> 'temporary-test-user',getTelegramUser:()=>null,isInTelegram:()=>true,initTelegramApp:()=>{}}));
import PaymentPage from '../pages/PaymentPage';
afterEach(()=>{cleanup();vi.unstubAllGlobals();mocks.login.mockReset();});
describe('recovered payment never bypasses device validation',()=>{
  it('checks a recovered key before creating a session, including device-limit rejection',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({found:true,key:'TEST-RECOVERY'}))));
    window.Telegram={WebApp:{initData:'test-only'} as never};
    mocks.login.mockResolvedValue({success:false,error:'Device limit reached'});
    const page=render(<BrowserRouter><PaymentPage/></BrowserRouter>);
    fireEvent.click(page.getByRole('button',{name:'✅ I already paid — log me in'}));
    await waitFor(()=>expect(mocks.login).toHaveBeenCalledWith('TEST-RECOVERY'));
    expect(localStorage.getItem('darksidex_auth_session')).toBeNull();
    delete window.Telegram;
  });
  it('does not attempt login or treat an unavailable key service as unpaid',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({found:false,error:'Unavailable'}),{status:503})));
    window.Telegram={WebApp:{initData:'test-only'} as never};
    const page=render(<BrowserRouter><PaymentPage/></BrowserRouter>);
    fireEvent.click(page.getByRole('button',{name:'✅ I already paid — log me in'}));
    await waitFor(()=>expect(page.getByRole('button',{name:'✅ I already paid — log me in'})).not.toBeDisabled());
    expect(mocks.login).not.toHaveBeenCalled();
    delete window.Telegram;
  });
});