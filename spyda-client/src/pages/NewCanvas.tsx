import { useNavigate } from 'react-router-dom'
import CreateDesignDialog from '../components/CreateDesignDialog'

/**
 * Canvas mode from nothing (File > New canvas, or a direct link): the same
 * "Create a design" picker Spyda AI opens, over the workspace colour. Closing
 * it goes back to Spyda AI.
 */
export default function NewCanvas() {
  const navigate = useNavigate()
  return (
    <main className="min-h-screen bg-background">
      <CreateDesignDialog
        open
        onClose={() => navigate('/workspace')}
        onChat={() => navigate('/workspace')}
      />
    </main>
  )
}
