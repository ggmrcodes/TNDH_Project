import { renderHook, waitFor } from '@testing-library/react-native';
import { useOverdueState } from '../useOverdueState';
import * as profileService from '../../services/profileService';
import * as transfusionService from '../../services/transfusionService';
import * as appointmentService from '../../services/appointmentService';

jest.mock('../../services/profileService');
jest.mock('../../services/transfusionService');
jest.mock('../../services/appointmentService');
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isMockMode: false }),
}));

describe('useOverdueState', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns isOverdue: false when no data exists', async () => {
    (profileService.getProfile as jest.Mock).mockResolvedValue({
      recommended_visit_interval_days: 28,
    });
    (transfusionService.getLatestTransfusion as jest.Mock).mockResolvedValue(null);
    (appointmentService.getMostRecentPastAppointment as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useOverdueState());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.overdueState).toEqual({ isOverdue: false });
    expect(result.current.error).toBeNull();
  });

  it('returns null overdueState and surfaces error on service failure', async () => {
    (profileService.getProfile as jest.Mock).mockRejectedValue(new Error('network down'));
    (transfusionService.getLatestTransfusion as jest.Mock).mockResolvedValue(null);
    (appointmentService.getMostRecentPastAppointment as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useOverdueState());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.overdueState).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
