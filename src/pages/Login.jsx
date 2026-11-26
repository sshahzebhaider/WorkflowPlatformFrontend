import { useState } from 'react';
import { App as AntApp, Button, Alert, Input, Select, Typography } from 'antd';
import { SafetyCertificateOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';
import { projectAccess } from '../auth/permissions';
export function Login() {
    const { db, login, apiMode, loginError } = usePlatform();
    const [id, setId] = useState('platform-admin');
    const [username, setUsername] = useState('');
    const [busy, setBusy] = useState(false);
    const nav = useNavigate();
    const msg = AntApp.useApp().message;
    async function connect() { setBusy(true); try {
        const loaded = await login(username);
        nav(loaded.identity.platformAdmin ? '/platform' : loaded.projectId ? `/project/${loaded.projectId}` : '/no-project');
    }
    catch (error) {
        msg.error(error.message);
    }
    finally {
        setBusy(false);
    } }
    if (apiMode)
        return <div className="login-page"><div className="login-decoration"><div className="big-logo">Bank Alfalah Ltd</div><h1>Build every process.<br />Without rebuilding your platform.</h1><p>One workspace for projects, forms, workflows, teams and configurations.</p><div className="login-decoration-foot">Workflow Platform</div></div><div className="login-panel"><div className="login-box"><div className="login-symbol"><SafetyCertificateOutlined /></div><h2>Welcome back</h2><p>Sign in with your provisioned workflow directory identity.</p>{import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE !== 'jwt' ? <><label className="field-label">Development username</label><Input size="large" autoFocus value={username} onChange={e => setUsername(e.target.value)} onPressEnter={connect} placeholder="platform.admin"/><Button type="primary" size="large" block loading={busy} style={{ marginTop: 22 }} onClick={connect}>Connect to API <ArrowRightOutlined /></Button></> : <Alert type="warning" showIcon message="Organization SSO required" description="Configure an OIDC/MSAL token provider for this production frontend. Never use development username headers in production."/>}{loginError && <Alert style={{ marginTop: 12 }} type="error" showIcon message="Connection unsuccessful" description={loginError}/>}</div></div></div>;
    function signIn() { if (db.users.find(u => u.id === id)?.directoryStatus === 'resigned' || db.users.find(u => u.id === id)?.active === false)
        return; login(id); const u = db.users.find(x => x.id === id); const first = db.projects.find(p => projectAccess(db, p.id, id)); nav(u?.platformAdmin ? '/platform' : first ? `/project/${first.id}` : '/no-project'); }
    return <div className="login-page"><div className="login-decoration"><div className="big-logo">Bank Alfalah Ltd</div><h1>Build every process.<br />Without rebuilding your platform.</h1><p>One workspace for projects, forms, workflows, teams and configurations.</p><div className="login-decoration-foot">Workflow Platform · Frontend prototype</div></div><div className="login-panel"><div className="login-box"><div className="login-symbol"><SafetyCertificateOutlined /></div><h2>Welcome back</h2><p>Sign in to your workflow administration workspace.</p><label className="field-label">Demo user</label><Select size="large" style={{ width: '100%' }} value={id} onChange={setId} options={db.users.filter(u => u.directoryStatus !== 'resigned' && u.active !== false).map(u => ({ value: u.id, label: `${u.name} (${u.username})` }))}/><Button type="primary" size="large" block style={{ marginTop: 22 }} onClick={signIn}>Continue <ArrowRightOutlined /></Button><Alert style={{ marginTop: 24 }} type="warning" showIcon message="Frontend demonstration only" description="This prototype uses local users and browser storage. It does not authenticate against AD/Entra ID or a backend. Never treat the role selector as production security."/></div></div></div>;
}
export function NoProject() { const { user, logout } = usePlatform(); return <div className="login-page no-project-page"><div className="login-box"><h2>No project access yet</h2><p>{user?.name}, a project administrator must assign you as a project admin, project role holder, or team member before its screens are available.</p><Button type="primary" onClick={logout}>Back to sign in</Button></div></div>; }
