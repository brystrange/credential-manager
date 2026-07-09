import sys

path = 'src/index.css'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '.pro-badge {\n  background: var(--accent);\n  color: #fff;\n}\n'
end_marker = '/* ─── Spin animation for loading icons ──────────────────────────── */'

start_idx = content.find(start_marker)
if start_idx == -1:
    print("Start marker not found")
    sys.exit(1)

start_idx += len(start_marker)

end_idx = content.find(end_marker, start_idx)
if end_idx == -1:
    print("End marker not found")
    sys.exit(1)

replacement = """
.current-badge {
  background: var(--green);
  color: var(--text-primary);
  border: 1px solid var(--green);
}

.pricing-card-header h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.pricing-price {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.price-amount {
  font-size: 1.9rem;
  font-weight: 700;
  color: var(--text-primary);
}

.price-period {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.pricing-features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1;
}

.pricing-features li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.83rem;
  color: var(--text-secondary);
}

.pricing-features li svg {
  color: var(--accent);
  flex-shrink: 0;
}

.pricing-card-footer {
  margin-top: auto;
}

.pricing-btn {
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.pricing-btn.primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: #fff;
}

.pricing-btn.primary:hover:not(:disabled) {
  filter: brightness(1.1);
  box-shadow: var(--shadow-glow);
}

.pricing-btn.secondary {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.pricing-btn.secondary:hover:not(:disabled) {
  background: var(--bg-card-hover);
}

.pricing-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.pricing-close {
  display: block;
  margin: 0 auto;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 6px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.pricing-close:hover {
  opacity: 1;
}

"""

new_content = content[:start_idx] + replacement + content[end_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("CSS restored successfully.")
