import { useLocation } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import { Link, NavLink } from 'react-router-dom';
import Icon from './Icons';

// Sidebar on desktop and iPad, bottom bar on phones. Same items in both.
export default function Shell({ items, sub, footer, topRight, sideTop, children }) {
  const location = useLocation();
  return (
    <div className="app">
      <aside className="side">
        <div className="side-top">
          <Link to="/" className="side-wm">Lilac Desk</Link>
          {sideTop}
        </div>
        <p className="side-sub">{sub}</p>
        <nav className="side-nav" aria-label="Main">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="side-link">
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge > 0 && <span className={`badge${item.tone === 'grey' ? ' badge--grey' : ''}`}>{item.badge}</span>}
              {item.dot && <span className="nav-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">{footer}</div>
      </aside>

      <header className="ptop">
        <Link to="/" className="ptop-wm">Lilac Desk</Link>
        <div className="ptop-right">{topRight}</div>
      </header>

      <div className="app-main"><ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary></div>

      <nav className="bnav" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }} aria-label="Main">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="bnav-link">
            <span className="bnav-icon">
              <Icon name={item.icon} />
              {item.badge > 0 && <span className={`badge${item.tone === 'grey' ? ' badge--grey' : ''}`}>{item.badge}</span>}
              {item.dot && <span className="nav-dot" />}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
