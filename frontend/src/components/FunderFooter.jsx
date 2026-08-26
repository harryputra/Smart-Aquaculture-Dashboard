import logoPolman from '../assets/logos/logo-polman.png';
import logoUlbi from '../assets/logos/logo-ulbi.png';
import logoDiktisaintek from '../assets/logos/logo-diktisaintek.png';

export default function FunderFooter({ variant = 'plain' }) {
  return (
    <footer className={'funder-footer' + (variant === 'card' ? ' funder-footer-card' : '')}>
      <div className="funder-footer-label">Pendanaan Dari</div>
      <p className="funder-footer-text">
        Direktorat Penelitian dan Pengabdian kepada Masyarakat, Direktorat Jenderal
        Riset dan Pengembangan, Kementerian Pendidikan Tinggi, Sains, dan Teknologi
      </p>
      <div className="funder-footer-logos">
        <img src={logoPolman} alt="Politeknik Manufaktur Bandung" />
        <img src={logoUlbi} alt="Universitas Logistik dan Bisnis Internasional" />
        <img src={logoDiktisaintek} alt="Diktisaintek Berdampak" />
      </div>
      <p className="funder-footer-meta">Dikembangkan untuk Program Hibah PKM BIMA 2026</p>
    </footer>
  );
}
