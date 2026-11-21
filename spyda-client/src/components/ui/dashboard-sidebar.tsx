import React, { useState } from 'react';
import {
  Image,
  Clock,
  FolderKanban,
  Blocks,
  Palette,
  Wallet,
  Settings,
  LogOut,
  Hash,
  BookOpen,
  GraduationCap,
  Gift,
  ChevronDown,
  ChevronRight,
} from './icons';
import InstallAppButton from '../InstallAppButton';
import BrandMark from '../brand/BrandMark';

/** Spyda AI is the product itself, so its nav item carries the live liquid-metal mark. */
// Takes the lucide icon props so it can sit in the same slot, and ignores them:
// the mark carries its own colour and size.
function SpydaAiIcon(_props: { className?: string; strokeWidth?: number }) {
  return <BrandMark size={18} animated />;
}

export type NavItemData = {
  id: string;
  title: string;
  icon: React.ElementType;
  badge?: number | string;
  shortcut?: string;
  children?: NavItemData[];
};

export type NavGroupData = {
  heading?: string;
  items: NavItemData[];
};

const spydaNavGroups: NavGroupData[] = [
  {
    items: [
      { id: 'canvas', title: 'Spyda AI', icon: SpydaAiIcon },
      { id: 'gallery', title: 'Gallery', icon: Image },
      { id: 'history', title: 'History', icon: Clock },
      { id: 'tasks', title: 'Tasks', icon: Gift },
    ],
  },
  {
    heading: 'Workspace',
    items: [
      {
        id: 'projects',
        title: 'Projects',
        icon: FolderKanban,
        children: [
          { id: 'p-active', title: 'Active', icon: Hash },
          { id: 'p-archived', title: 'Archived', icon: Hash },
        ],
      },
      { id: 'templates', title: 'Templates', icon: Blocks },
      { id: 'brand-assets', title: 'Brand Assets', icon: Palette },
    ],
  },
  {
    heading: 'Documentation',
    items: [
      { id: 'whitepaper', title: 'Whitepaper', icon: BookOpen },
      { id: 'guides', title: 'Guides', icon: GraduationCap },
    ],
  },
];

const spydaAccountItems: NavGroupData = {
  heading: 'Account',
  items: [
    { id: 'wallet', title: 'Wallet', icon: Wallet },
    { id: 'settings', title: 'Settings', icon: Settings },
    { id: 'logout', title: 'Log out', icon: LogOut },
  ],
};

function WorkspaceSwitcher({
  selected,
  onSelect,
}: {
  selected?: string;
  onSelect?: (ws: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSelected, setInternalSelected] = useState('My Workspace');

  const current = selected || internalSelected;
  const handleSelect = onSelect || setInternalSelected;

  return (
    <div className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-2 py-2 mb-4 rounded-lg hover:bg-white/5 cursor-pointer transition-colors select-none group"
      >
        <div className="flex items-center gap-3">
          <img
            src="/assets/spyda-logo.png"
            alt="Spyda"
            className="h-8 w-8 shrink-0 object-contain"
          />
          <div className="flex flex-col overflow-hidden">
            <span className="text-[13px] font-heading font-medium leading-none mb-1 text-foreground truncate max-w-[120px]">
              {current}
            </span>
            <span className="text-[11px] text-muted-foreground leading-none">
              Design workspace
            </span>
          </div>
        </div>
        <ChevronDown
          className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors shrink-0"
          strokeWidth={1.5}
        />
      </div>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-[52px] left-0 w-full bg-card border border-border/50 rounded-lg shadow-xl z-50 py-1 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
            {['My Workspace', 'Team Workspace'].map((ws) => (
              <div
                key={ws}
                onClick={() => {
                  handleSelect(ws);
                  setIsOpen(false);
                }}
                className={`px-3 py-2 mx-1 text-[13px] rounded-md cursor-pointer transition-colors ${
                  current === ws
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground/80 hover:bg-white/5'
                }`}
              >
                {ws}
              </div>
            ))}
            <div className="h-px bg-border/50 my-1 mx-2" />
            <div className="px-3 py-2 mx-1 text-[13px] text-muted-foreground hover:bg-white/5 rounded-md cursor-pointer flex items-center gap-2 transition-colors">
              <span className="text-[16px] leading-none mb-0.5">+</span> Create
              Workspace
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NavItem({
  item,
  activeId,
  onSelect,
  level = 0,
}: {
  item: NavItemData;
  activeId: string;
  onSelect: (id: string) => void;
  level?: number;
}) {
  const isActive = activeId === item.id;
  const hasChildren = !!item.children;
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = () => {
    if (hasChildren) {
      setIsOpen(!isOpen);
      onSelect(item.id);
    } else {
      onSelect(item.id);
    }
  };

  return (
    <div className="flex flex-col w-full">
      <div
        className={`group flex items-center justify-between px-2.5 py-[7px] rounded-[6px] cursor-pointer transition-all duration-200 select-none
          ${
            isActive
              ? 'border-l-2 border-primary bg-primary/5 text-primary font-medium'
              : 'text-muted-foreground hover:bg-white/5 hover:text-foreground/90'
          }
        `}
        style={{ paddingLeft: `${level * 12 + 10}px` }}
        onClick={handleClick}
      >
        <div className="flex items-center gap-2.5">
          <item.icon
            className={`w-[16px] h-[16px] transition-colors
              ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground/70 group-hover:text-foreground/70'
              }
            `}
            strokeWidth={1.5}
          />
          <span className="text-[13px] font-sans tracking-wide truncate">
            {item.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {item.shortcut && (
            <kbd className="hidden group-hover:inline-flex items-center justify-center h-5 px-1.5 text-[10px] font-medium font-mono text-muted-foreground/60 bg-background/50 border border-border/50 rounded-[4px] shadow-xs">
              {item.shortcut}
            </kbd>
          )}
          {item.badge && (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-medium rounded-full bg-primary/15 text-primary">
              {item.badge}
            </span>
          )}
          {hasChildren && (
            <ChevronRight
              className={`w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 ${
                isOpen ? 'rotate-90' : ''
              }`}
              strokeWidth={2}
            />
          )}
        </div>
      </div>

      {hasChildren && (
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
            isOpen
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden min-h-0 relative flex flex-col gap-0.5 mt-0.5">
            <div
              className="absolute top-0 bottom-0 border-l border-white/5"
              style={{ left: `${level * 12 + 17.5}px` }}
            />
            {item.children!.map((child) => (
              <NavItem
                key={child.id}
                item={child}
                activeId={activeId}
                onSelect={onSelect}
                level={level + 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One round icon in the collapsed rail; the label lives in the tooltip. */
function RailItem({ item, active, onSelect }: { item: NavItemData; active: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      title={item.title}
      aria-label={item.title}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
        active && item.icon === SpydaAiIcon
          ? // The chrome mark disappears on solid green, so its active state is a lit ring.
            'bg-[#0b1412] ring-2 ring-primary shadow-[0_8px_22px_rgba(157,250,176,0.25)]'
          : active
          ? 'bg-primary text-primary-foreground shadow-[0_8px_22px_rgba(157,250,176,0.25)]'
          : 'border border-white/[0.07] bg-white/[0.03] text-muted-foreground hover:-translate-y-0.5 hover:border-primary/30 hover:text-foreground'
      }`}
    >
      <item.icon className="h-[17px] w-[17px]" strokeWidth={1.7} />
      {item.badge ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-[#08090a]">
          {item.badge}
        </span>
      ) : null}
    </button>
  );
}

function SidebarRail({ currentId, onSelect, taskBadge, className }: {
  currentId: string;
  onSelect: (id: string) => void;
  taskBadge?: number;
  className: string;
}) {
  const items = spydaNavGroups.flatMap(group => group.items);
  const isActive = (item: NavItemData) =>
    item.id === currentId || Boolean(item.children?.some(child => child.id === currentId));
  return (
    <nav aria-label="Workspace" className={`flex h-full w-[76px] flex-col items-center border-r border-white/[0.06] bg-[#08090a] py-4 ${className}`}>
      <img src="/assets/spyda-logo.png" alt="Spyda" className="mb-5 h-9 w-9 object-contain" />
      <div className="flex min-h-0 flex-1 flex-col items-center gap-2.5 overflow-y-auto px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(item => (
          <RailItem
            key={item.id}
            item={item.id === 'tasks' ? { ...item, badge: taskBadge } : item}
            active={isActive(item)}
            onSelect={onSelect}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-col items-center gap-2.5 border-t border-white/[0.06] pt-3">
        {spydaAccountItems.items.map(item => (
          <RailItem key={item.id} item={item} active={item.id === currentId} onSelect={onSelect} />
        ))}
      </div>
    </nav>
  );
}

export function SidebarNav({
  className = '',
  activeId,
  onSelect,
  activeWorkspace,
  onWorkspaceSelect,
  taskBadge,
  compact = false,
}: {
  className?: string;
  activeId?: string;
  onSelect?: (id: string) => void;
  activeWorkspace?: string;
  onWorkspaceSelect?: (ws: string) => void;
  taskBadge?: number;
  /** The icon rail: round icons only, labels as tooltips. */
  compact?: boolean;
}) {
  const [internalId, setInternalId] = useState('canvas');
  const currentId = activeId !== undefined ? activeId : internalId;
  const handleSelect = onSelect || setInternalId;

  if (compact) {
    return <SidebarRail currentId={currentId} onSelect={handleSelect} taskBadge={taskBadge} className={className} />;
  }

  return (
    <div
      className={`flex flex-col w-[260px] h-full bg-[#08090a] border-r border-border/50 p-3 font-sans ${className}`}
    >
      <WorkspaceSwitcher
        selected={activeWorkspace}
        onSelect={onWorkspaceSelect}
      />

      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col gap-4 mt-2">
        {spydaNavGroups.map((group, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            {group.heading && (
              <span className="px-2.5 mb-1 text-[11px] font-heading font-semibold tracking-wider text-muted-foreground/50 uppercase">
                {group.heading}
              </span>
            )}
            {group.items.map((item) => (
              <NavItem
                key={item.id}
                item={item.id === 'tasks' ? { ...item, badge: taskBadge } : item}
                activeId={currentId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-auto pt-4 border-t border-border/50 flex flex-col gap-0.5">
        <div className="mb-2">
          <InstallAppButton />
        </div>
        {spydaAccountItems.heading && (
          <span className="px-2.5 mb-1 text-[11px] font-heading font-semibold tracking-wider text-muted-foreground/50 uppercase">
            {spydaAccountItems.heading}
          </span>
        )}
        {spydaAccountItems.items.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            activeId={currentId}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}

export default SidebarNav;
