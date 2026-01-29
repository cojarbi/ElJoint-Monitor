
import unittest
from datetime import datetime
from agents.tools.types import PlannedSpot, AiredSpot, DiscrepancyType
from agents.tools.spot_matcher import match_spots

class TestSpotMatcher(unittest.TestCase):
    def test_one_to_one_matching_perfect(self):
        # 1 Planned, 1 Aired (Perfect)
        planned = [PlannedSpot(channel="TVN", program="News", days="L-V", time_slot="Morning", duration=30)]
        aired = [AiredSpot(channel="TVN", program="News", date=datetime(2023, 10, 23), duration=30)] # 2023-10-23 is Monday (L)
        
        result = match_spots(planned, aired)
        self.assertEqual(len(result.matched), 1)
        self.assertEqual(len(result.discrepancies), 0)

    def test_one_to_one_matching_overage(self):
        # 1 Planned, 2 Aired (1 Perfect, 1 Overage)
        planned = [PlannedSpot(channel="TVN", program="News", days="L-V", time_slot="Morning", duration=30)]
        aired = [
            AiredSpot(channel="TVN", program="News", date=datetime(2023, 10, 23), duration=30), # Match
            AiredSpot(channel="TVN", program="News", date=datetime(2023, 10, 24), duration=30)  # Extra
        ]
        
        result = match_spots(planned, aired)
        self.assertEqual(len(result.matched), 1)
        self.assertEqual(len(result.discrepancies), 1)
        self.assertEqual(result.discrepancies[0].type, DiscrepancyType.EXTRA_SPOT)

    def test_wrong_day_logic(self):
        # 1 Planned (L-V), 1 Aired on Sunday
        planned = [PlannedSpot(channel="TVN", program="News", days="L-V", time_slot="Morning", duration=30)]
        aired = [AiredSpot(channel="TVN", program="News", date=datetime(2023, 10, 22), duration=30)] # Sunday
        
        result = match_spots(planned, aired)
        self.assertEqual(len(result.matched), 1) # Now considered a match, just flagged
        # It adds to 'discrepancies' with type WRONG_TIME
        # And it marks as consumed.
        
        self.assertEqual(len(result.discrepancies), 1)
        self.assertEqual(result.discrepancies[0].type, DiscrepancyType.WRONG_TIME)
        self.assertEqual(len(result.unmatched_planned), 0) # Should be consumed
        self.assertEqual(len(result.unmatched_aired), 0)   # Should be consumed

    def test_prioritize_perfect_match(self):
        # 1 Planned, 2 Aired (1 Wrong Day, 1 Perfect) -> Should pick Perfect
        planned = [PlannedSpot(channel="TVN", program="News", days="L-V", time_slot="Morning", duration=30)]
        
        # Spot 1: Sunday (Wrong Day)
        # Spot 2: Monday (Perfect)
        aired = [
            AiredSpot(channel="TVN", program="News", date=datetime(2023, 10, 22), duration=30),
            AiredSpot(channel="TVN", program="News", date=datetime(2023, 10, 23), duration=30)
        ]
        
        result = match_spots(planned, aired)
        self.assertEqual(len(result.matched), 1)
        self.assertEqual(result.matched[0].aired.date.day, 23) # Should match Monday
        self.assertEqual(len(result.discrepancies), 1)
        self.assertEqual(result.discrepancies[0].type, DiscrepancyType.EXTRA_SPOT) # The Sunday one is extra

if __name__ == '__main__':
    unittest.main()
