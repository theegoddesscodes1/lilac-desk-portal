import { formatDate, formatSize, openFile } from '../lib/orderApi';

export default function FileList({ files, empty = 'No files yet.' }) {
  if (!files.length) return <p className="muted">{empty}</p>;

  return (
    <ul className="file-list">
      {files.map((file) => (
        <li key={file.id} className="file-row">
          <div>
            <p className="file-name">{file.name}</p>
            <p className="muted small">
              {formatDate(file.created_at, true)}
              {file.size ? `, ${formatSize(file.size)}` : ''}
            </p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => openFile(file)}>
            Download
          </button>
        </li>
      ))}
    </ul>
  );
}
